"use server";

import { validateLegacyDraft, LegacyFileConflict, LEGACY_FILE_CONFLICT } from "@/lib/uploads/coordination";

import { qualifyLegacyDocuments } from "@/lib/uploads/qualification";
import { DocumentQualificationError } from "@/lib/files/qualification";

import { ApplicationStatus, PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAppUrl } from "@/lib/app-url";
import { requireSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { dispatchSubmissionIntent } from "@/lib/payments/legacy-notifications";
import { applicationDraftSchema, finalSubmissionSchema } from "@/lib/validations/application";
import { PAYMENT_AMOUNT_TOMAN } from "@/lib/validations/shared";
import { requestZarinpalPayment } from "@/lib/payments/zarinpal";
import { claimPaymentOperation, existingPaymentUrl, finishPaymentRequest, lockPaymentApplication, markPaymentUncertain, paymentObligation, PAYMENT_UNCERTAIN_MESSAGE, savePaymentResult } from "@/lib/payments/coordination";
import { completeVerifiedLegacySubmission, settleLegacyPayment } from "@/lib/payments/legacy-settlement";

type PaymentStartResult =
  | { ok: true; redirectTo: string }
  | { ok: false; message: string };

const PAYMENT_PENDING_MESSAGE = PAYMENT_UNCERTAIN_MESSAGE;

export async function startPayment(input: unknown): Promise<PaymentStartResult> {
  const session = await requireSession("user");
  const application = await db.application.findFirst({
    where: { userId: session.subjectId },
    orderBy: { createdAt: "desc" },
    include: {
      payments: {

        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!application) {
    return { ok: false, message: "پرونده‌ای برای پرداخت پیدا نشد" };
  }

  // Recover a crash after durable capture before requiring any editable form data.
  if (application.status === ApplicationStatus.PENDING_PAYMENT && application.payments.some(p => p.status === PaymentStatus.VERIFIED)) {
    await completeVerifiedLegacySubmission(application.id);
    await dispatchSubmissionIntent(application.id, application.mobile);
    return { ok: true, redirectTo: "/dashboard/application" };
  }

  function prepareDraft() {
    const draft = applicationDraftSchema.safeParse(input);
    if (!draft.success) throw new DocumentQualificationError("required", "مدارک الزامی پرونده");
    const draftData = draft.data;
    const validation = finalSubmissionSchema.safeParse({ ...draftData, acceptedTerms: true });
    if (!validation.success) throw new DocumentQualificationError("required", "مدارک الزامی پرونده");
    return { draftData, persistedDraft: {
      currentStep: draftData.currentStep ?? application!.currentStep,
      taxDeclarations: draftData.taxDeclarations,
      financials: draftData.financials,
      humanResources: validation.data.humanResources,
      trialBalance: validation.data.trialBalance,
      creditReports: validation.data.creditReports,
    } };
  }

  const reservation = await db.$transaction(async (tx) => {
    await lockPaymentApplication(tx, "legacy", application.id);
    const current = await tx.application.findUniqueOrThrow({ where: { id: application.id } });
    if (current.userId !== session.subjectId) throw new Error("payment ownership changed");
    const verified = await tx.payment.findMany({ where: { applicationId: application.id, status: PaymentStatus.VERIFIED } });
    if (verified.length) {
      if ([ApplicationStatus.NEEDS_EDIT, ApplicationStatus.DRAFT, ApplicationStatus.PENDING_PAYMENT].includes(current.status as "NEEDS_EDIT" | "DRAFT" | "PENDING_PAYMENT")) {
        const { draftData, persistedDraft } = prepareDraft();
        await validateLegacyDraft(tx, current, draftData, draftData.draftVersion);
        await qualifyLegacyDocuments(tx, current.id, draftData);
        await tx.application.update({ where: { id: application.id }, data: { ...persistedDraft, draftVersion: { increment: 1 }, status: ApplicationStatus.SUBMITTED, ...(current.status !== ApplicationStatus.NEEDS_EDIT ? { submittedAt: new Date() } : {}) } });
        await tx.statusHistory.create({ data: { applicationId: application.id, previousStatus: current.status, newStatus: ApplicationStatus.SUBMITTED, note: current.status === ApplicationStatus.NEEDS_EDIT ? "اصلاحات متقاضی ارسال شد" : "مدارک تکمیل و پرونده با پرداخت ثبت‌شده ارسال شد" } });
        if (current.status !== ApplicationStatus.NEEDS_EDIT) {
          const paidObligation = await tx.paymentObligation.findUnique({ where: { legacyApplicationId: current.id } });
          if (paidObligation) await tx.paymentNotificationIntent.upsert({ where: { obligationId: paidObligation.id }, create: { obligationId: paidObligation.id }, update: {} });
        }
        return { kind: "resubmitted" as const };
      }
      return { kind: "paid" as const };
    }
    const obligation = await paymentObligation(tx, "legacy", application.id, PAYMENT_AMOUNT_TOMAN);
    if (obligation.state !== "READY") {
      const payment = obligation.legacyPaymentId ? await tx.payment.findUnique({ where: { id: obligation.legacyPaymentId } }) : null;
      return { kind: "existing" as const, payment, payable: obligation.state === "PAYABLE" };
    }
    if (current.status !== ApplicationStatus.DRAFT && current.status !== ApplicationStatus.PENDING_PAYMENT) return { kind: "existing" as const, payment: null };
    const { draftData, persistedDraft } = prepareDraft();
    const appUrl = requireAppUrl();
    await validateLegacyDraft(tx, current, draftData, draftData.draftVersion);
    await qualifyLegacyDocuments(tx, current.id, draftData);
    await tx.application.update({ where: { id: application.id }, data: { ...persistedDraft, draftVersion: { increment: 1 } } });
    const payment = await tx.payment.create({ data: { applicationId: application.id, amountToman: obligation.amountToman, status: PaymentStatus.INITIATED } });
    const claim = await claimPaymentOperation(tx, obligation, "REQUEST", payment.id);
    return { kind: "new" as const, payment, claim, appUrl };
  }).catch(error => {
    if (error instanceof DocumentQualificationError) return { kind: "document-error" as const, message: error.message };
    if (error instanceof LegacyFileConflict) return { kind: "draft-conflict" as const };
    throw error;
  });
  if (reservation.kind === "document-error") return { ok: false, message: reservation.message };
  if (reservation.kind === "draft-conflict") return { ok: false, message: LEGACY_FILE_CONFLICT };
  if (reservation.kind === "resubmitted") {
    await dispatchSubmissionIntent(application.id, application.mobile);
    return { ok: true, redirectTo: "/dashboard" };
  }
  if (reservation.kind === "paid") {
    await dispatchSubmissionIntent(application.id, application.mobile);
    return { ok: false, message: "وضعیت پرونده تغییر کرده است. پرداخت شما ثبت شده؛ صفحه را تازه‌سازی کنید تا وضعیت فعلی را ببینید." };
  }
  if (reservation.kind === "existing") {
    const payment = reservation.payment;
    if (payment?.authority && reservation.payable) return { ok: true, redirectTo: existingPaymentUrl(payment.authority) };
    if (payment?.authority) {
      const outcome = await settleLegacyPayment({ ...payment, application }, payment.authority);
      if (outcome === "verified" || outcome === "already-settled") {
        try { await dispatchSubmissionIntent(application.id, application.mobile); }
        catch (error) { logger.error("payment_notification_failed", error, { applicationId: application.id }); }
      }
      if (outcome === "verified" || outcome === "already-settled" || outcome === "duplicate") return { ok: true, redirectTo: `/payment/return?paymentId=${payment.id}` };
    }
    return { ok: false, message: PAYMENT_PENDING_MESSAGE };
  }
  const { payment, claim, appUrl } = reservation;

  logger.info("payment_start_requested", {
    applicationId: application.id,
    paymentId: payment.id,
    amountToman: payment.amountToman,
  });

  let zarinpal: { authority: string; paymentUrl: string };

  try {
    zarinpal = await requestZarinpalPayment({
      amountToman: payment.amountToman,
      description: "پرداخت ثبت پرونده سامانه اعتبار سنجی سانا",
      callbackUrl: `${appUrl}/api/payment/callback?paymentId=${payment.id}`,
      mobile: application.mobile,
    });
  } catch (error) {
    logger.error("payment_start_failed", error, {
      applicationId: application.id,
      paymentId: payment.id,
    });
    await savePaymentResult(claim, "UNKNOWN").catch(() => undefined);
    await markPaymentUncertain(claim, "REQUEST_UNRESOLVED").catch(() => undefined);
    return { ok: false, message: PAYMENT_PENDING_MESSAGE };
  }

  try {
    const ready = await finishPaymentRequest(claim, "legacy", application.id, payment.id, zarinpal.authority, async (tx) => {
      await tx.application.updateMany({ where: { id: application.id, status: ApplicationStatus.DRAFT }, data: { status: ApplicationStatus.PENDING_PAYMENT } });
      await tx.payment.update({ where: { id: payment.id }, data: { authority: zarinpal.authority } });
    });
    if (!ready) return { ok: false, message: PAYMENT_PENDING_MESSAGE };
  } catch (error) {
    logger.error("payment_request_persist_failed", error, { paymentId: payment.id });
    return { ok: false, message: PAYMENT_PENDING_MESSAGE };
  }

  logger.info("payment_start_succeeded", {
    applicationId: application.id,
    paymentId: payment.id,
  });

  return { ok: true, redirectTo: zarinpal.paymentUrl };
}
