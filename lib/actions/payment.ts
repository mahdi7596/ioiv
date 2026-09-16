"use server";

import { ApplicationStatus, PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAppUrl } from "@/lib/app-url";
import { requireSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { notifyAdminOfSubmission, notifyUserOfSubmission } from "@/lib/payments/legacy-notifications";
import { applicationDraftSchema, finalSubmissionSchema } from "@/lib/validations/application";
import { PAYMENT_AMOUNT_TOMAN } from "@/lib/validations/shared";
import { requestZarinpalPayment } from "@/lib/payments/zarinpal";
import { settleLegacyPayment } from "@/lib/payments/legacy-settlement";

type PaymentStartResult =
  | { ok: true; redirectTo: string }
  | { ok: false; message: string };

const PAYMENT_START_FAILED_MESSAGE = "شروع پرداخت ناموفق بود. کمی بعد دوباره تلاش کنید.";
const PAYMENT_VALIDATION_FAILED_MESSAGE = "مدارک الزامی پیش از پرداخت کامل نیست";
const PAYMENT_PENDING_MESSAGE = "وضعیت پرداخت قبلی شما هنوز از درگاه دریافت نشده است. اگر مبلغ کسر شده باشد، پرداخت به‌صورت خودکار ثبت می‌شود؛ چند دقیقه بعد دوباره تلاش کنید.";

export async function startPayment(input: unknown): Promise<PaymentStartResult> {
  const session = await requireSession("user");
  const application = await db.application.findFirst({
    where: { userId: session.subjectId },
    orderBy: { createdAt: "desc" },
    include: {
      payments: {
        where: { status: { in: [PaymentStatus.INITIATED, PaymentStatus.VERIFIED] } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!application) {
    return { ok: false, message: "پرونده‌ای برای پرداخت پیدا نشد" };
  }

  const draft = applicationDraftSchema.safeParse(input);

  if (!draft.success) {
    return {
      ok: false,
      message: draft.error.issues[0]?.message || PAYMENT_VALIDATION_FAILED_MESSAGE,
    };
  }

  const draftData = draft.data;
  const validation = finalSubmissionSchema.safeParse({
    taxDeclarations: draftData.taxDeclarations,
    financials: draftData.financials,
    humanResources: draftData.humanResources,
    trialBalance: draftData.trialBalance,
    creditReports: draftData.creditReports,
    acceptedTerms: true,
  });

  if (!validation.success) {
    return { ok: false, message: PAYMENT_VALIDATION_FAILED_MESSAGE };
  }

  const persistedDraft = {
    currentStep: draftData.currentStep ?? application.currentStep,
    taxDeclarations: validation.data.taxDeclarations,
    financials: validation.data.financials,
    humanResources: validation.data.humanResources,
    trialBalance: validation.data.trialBalance,
    creditReports: validation.data.creditReports,
  };

  const hasVerifiedPayment = application.payments.some(
    (payment) => payment.status === PaymentStatus.VERIFIED,
  );

  if (hasVerifiedPayment && application.status === ApplicationStatus.NEEDS_EDIT) {
    await db.application.update({
      where: { id: application.id },
      data: {
        ...persistedDraft,
        status: ApplicationStatus.SUBMITTED,
      },
    });
    logger.info("application_resubmitted_without_payment", {
      applicationId: application.id,
    });
    return { ok: true, redirectTo: "/dashboard" };
  }

  if (hasVerifiedPayment) {
    return { ok: false, message: "پرداخت قبلاً ثبت شده است" };
  }

  // An attempt that already reached the gateway may have been paid without the
  // callback ever landing (closed tab, network loss, or a persist failure after
  // verification). Ask Zarinpal before charging again: a confirmed capture
  // completes the submission with no new fee, an explicit rejection is closed,
  // and an unreachable gateway leaves the attempt open rather than duplicating it.
  const openPayment = application.payments.find(
    (payment) => payment.status === PaymentStatus.INITIATED && payment.authority,
  );

  if (openPayment?.authority) {
    const outcome = await settleLegacyPayment(
      {
        id: openPayment.id,
        applicationId: application.id,
        amountToman: openPayment.amountToman,
        authority: openPayment.authority,
        status: openPayment.status,
        application: { status: application.status, payments: application.payments },
      },
      openPayment.authority,
    );

    if (outcome === "already-settled" || outcome === "duplicate") {
      return { ok: false, message: "پرداخت قبلاً ثبت شده است" };
    }

    if (outcome === "verified") {
      logger.info("payment_retry_recovered_verified_attempt", {
        applicationId: application.id,
        paymentId: openPayment.id,
      });
      try {
        await Promise.all([
          notifyAdminOfSubmission(application.id),
          notifyUserOfSubmission(application.mobile, application.id),
        ]);
      } catch (error) {
        logger.error("payment_notification_failed", error, {
          applicationId: application.id,
          paymentId: openPayment.id,
        });
      }
      return { ok: true, redirectTo: `/payment/return?status=success&paymentId=${openPayment.id}` };
    }

    if (outcome !== "rejected") {
      return { ok: false, message: PAYMENT_PENDING_MESSAGE };
    }
  }

  if (application.status === ApplicationStatus.PENDING_PAYMENT) {
    await db.payment.updateMany({
      where: {
        applicationId: application.id,
        status: PaymentStatus.INITIATED,
      },
      data: {
        status: PaymentStatus.FAILED,
        rawData: { reason: "payment_retry_started" },
      },
    });
  }

  await db.application.update({
    where: { id: application.id },
    data: persistedDraft,
  });

  const appUrl = requireAppUrl();
  const payment = await db.payment.create({
    data: {
      applicationId: application.id,
      amountToman: PAYMENT_AMOUNT_TOMAN,
      status: PaymentStatus.INITIATED,
    },
  });

  logger.info("payment_start_requested", {
    applicationId: application.id,
    paymentId: payment.id,
    amountToman: PAYMENT_AMOUNT_TOMAN,
  });

  let zarinpal: { authority: string; paymentUrl: string };

  try {
    zarinpal = await requestZarinpalPayment({
      amountToman: PAYMENT_AMOUNT_TOMAN,
      description: "پرداخت ثبت پرونده سامانه اعتبار سنجی سانا",
      callbackUrl: `${appUrl}/api/payment/callback?paymentId=${payment.id}`,
      mobile: application.mobile,
    });
  } catch (error) {
    logger.error("payment_start_failed", error, {
      applicationId: application.id,
      paymentId: payment.id,
    });
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        rawData: { error: error instanceof Error ? error.message : "payment request failed" },
      },
    });
    if (application.status === ApplicationStatus.PENDING_PAYMENT) {
      await db.application.update({
        where: { id: application.id },
        data: { status: ApplicationStatus.DRAFT },
      });
    }
    return { ok: false, message: PAYMENT_START_FAILED_MESSAGE };
  }

  await db.$transaction([
    db.application.update({
      where: { id: application.id },
      data: { status: ApplicationStatus.PENDING_PAYMENT },
    }),
    db.payment.update({
      where: { id: payment.id },
      data: { authority: zarinpal.authority },
    }),
  ]);

  logger.info("payment_start_succeeded", {
    applicationId: application.id,
    paymentId: payment.id,
  });

  return { ok: true, redirectTo: zarinpal.paymentUrl };
}
