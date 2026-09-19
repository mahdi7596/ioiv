"use server";

import { qualifyFacilitiesDocuments } from "@/lib/facilities-files/qualification";
import { DocumentQualificationError } from "@/lib/files/qualification";

import { randomUUID } from "node:crypto";
import { ApplicationStatus, AuditActorType, AuditOutcome, FacilitiesAuditAction, FacilitiesPaymentStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { ActionError } from "@/lib/actions/auth";
import { db } from "@/lib/db";
import { requestZarinpalPayment, verifyZarinpalPayment } from "@/lib/payments/zarinpal";
import { isZarinpalRejection } from "@/lib/payments/zarinpal-errors";
import { beginPaymentVerification, claimPaymentOperation, existingPaymentUrl, finishPaymentRequest, lockPaymentApplication, markPaymentUncertain, paymentObligation, PAYMENT_UNCERTAIN_MESSAGE, savePaymentResult } from "@/lib/payments/coordination";
import { logger } from "@/lib/logger";
import { requireAppUrl } from "@/lib/app-url";
import { checkFacilitiesSubmissionReadiness, deriveFacilitiesSubmissionInput, facilitiesSubmissionInclude, isCorrectionAddressed, loadFacilitiesSubmissionApplication, materializeFacilitiesEvidence, refreshFacilitiesProfileSnapshot } from "@/lib/facilities/submission";

const ACTIVE_PAYMENT_STATES: FacilitiesPaymentStatus[] = [
  FacilitiesPaymentStatus.INITIATED,
  FacilitiesPaymentStatus.REDIRECT_READY,
  FacilitiesPaymentStatus.PENDING,
];
const LOCKED_PAYMENT_STATES: FacilitiesPaymentStatus[] = [...ACTIVE_PAYMENT_STATES, FacilitiesPaymentStatus.TIMED_OUT];

const PAYMENT_PENDING_MESSAGE = PAYMENT_UNCERTAIN_MESSAGE;
const SUBMISSION_VALIDATION_MESSAGE = "همه اطلاعات و مدارک الزامی باید کامل و بررسی‌شده باشند.";

// Surface the specific blocking reasons so a user isn't left guessing which
// requirement is missing (e.g. a profile completed before «شماره همراه رابط»
// became required, or a newly-required annual document).
function submissionValidationError(issues: string[], status?: number) {
  const detail = issues.length ? ` موارد باقی‌مانده: ${issues.join("؛ ")}` : "";
  return new ActionError(`${SUBMISSION_VALIDATION_MESSAGE}${detail}`, status);
}
async function qualifyDocuments(tx: Prisma.TransactionClient, application: { id: string; companyId: string; userId: string }) {
  try { await qualifyFacilitiesDocuments(tx, application); }
  catch (error) { if (error instanceof DocumentQualificationError) throw new ActionError(error.message, 400); throw error; }
}
const CORRECTION_NOT_ADDRESSED_MESSAGE = "نسبت به زمان درخواست اصلاح، هیچ مدرکی بارگذاری نشده است. لطفاً مدرک خواسته‌شده توسط کارشناس را دوباره بارگذاری کنید.";

async function requireFacilitiesUserSession() {
  try {
    return await requireSession("user");
  } catch {
    throw new ActionError("جلسه شما منقضی شده است؛ دوباره وارد شوید", 401);
  }
}

export type FacilitiesPaymentStartResult =
  | { ok: true; state: "redirect"; redirectTo: string }
  | { ok: true; state: "submitted"; redirectTo: string }
  | { ok: true; state: "pending"; message: string }
  | { ok: false; state: "failed"; message: string };

export type FacilitiesSubmissionResult =
  | { ok: true; state: "submitted"; redirectTo: string }
  | { ok: true; state: "already-submitted"; redirectTo: string };

function appUrl(path: string) {
  return new URL(path, requireAppUrl()).toString();
}

async function lockFacilitiesApplication(tx: Prisma.TransactionClient, applicationId: string) {
  await tx.facilitiesApplication.update({ where: { id: applicationId }, data: { updatedAt: new Date() } });
  return loadFacilitiesSubmissionApplication(tx, applicationId);
}

async function lockFacilitiesPayment(tx: Prisma.TransactionClient, paymentId: string) {
  await tx.facilitiesPaymentAttempt.update({ where: { id: paymentId }, data: { updatedAt: new Date() } });
  return tx.facilitiesPaymentAttempt.findUnique({ where: { id: paymentId } });
}

async function recordStatusChange(
  tx: Prisma.TransactionClient,
  applicationId: string,
  previousStatus: ApplicationStatus,
  newStatus: ApplicationStatus,
  actorType: AuditActorType,
  actorId: string | undefined,
  note: string,
) {
  await tx.facilitiesStatusHistory.create({ data: { applicationId, previousStatus, newStatus, actorType, actorId, note } });
  await tx.facilitiesApplication.update({ where: { id: applicationId }, data: { status: newStatus, ...(newStatus === ApplicationStatus.SUBMITTED && previousStatus !== ApplicationStatus.NEEDS_EDIT ? { submittedAt: new Date() } : {}) } });
}

async function returnPaymentApplicationToDraft(tx: Prisma.TransactionClient, applicationId: string) {
  const application = await tx.facilitiesApplication.findUnique({ where: { id: applicationId }, select: { status: true } });
  if (application?.status !== ApplicationStatus.PENDING_PAYMENT) return;
  await recordStatusChange(tx, applicationId, ApplicationStatus.PENDING_PAYMENT, ApplicationStatus.DRAFT, AuditActorType.SYSTEM, "system", "پرداخت کامل نشد و درخواست به پیش‌نویس بازگشت");
}

async function submitLockedFacilitiesApplication(
  tx: Prisma.TransactionClient,
  application: NonNullable<Awaited<ReturnType<typeof loadFacilitiesSubmissionApplication>>>,
  actorType: AuditActorType,
  actorId: string,
): Promise<FacilitiesSubmissionResult> {
  if (application.status === ApplicationStatus.SUBMITTED || application.status === ApplicationStatus.VALIDATION_COMPLETED) {
    return { ok: true, state: "already-submitted", redirectTo: "/dashboard/facilities-application?submitted=already" };
  }

  if (application.status !== ApplicationStatus.DRAFT && application.status !== ApplicationStatus.PENDING_PAYMENT && application.status !== ApplicationStatus.NEEDS_EDIT) {
    throw new ActionError("این درخواست در حال حاضر قابل ارسال نیست", 409);
  }

  const input = deriveFacilitiesSubmissionInput(application);
  const readiness = checkFacilitiesSubmissionReadiness(application, input);
  if (!readiness.ready) throw submissionValidationError(readiness.issues, 400);

  const verifiedPayment = application.payments.find(
    (payment) => payment.status === FacilitiesPaymentStatus.VERIFIED && payment.amountToman === application.paymentAmountTomanSnapshot,
  );
  if (application.paymentEnabledSnapshot && !verifiedPayment) {
    throw new ActionError("ابتدا پرداخت را با موفقیت انجام دهید", 409);
  }

  await qualifyDocuments(tx, application);
  await materializeFacilitiesEvidence(tx, application, input);
  const correction = application.status === ApplicationStatus.NEEDS_EDIT
    ? await tx.facilitiesCorrectionRequest.findFirst({ where: { applicationId: application.id, resolvedAt: null } })
    : null;
  if (application.status === ApplicationStatus.NEEDS_EDIT && !correction) throw new ActionError("درخواست اصلاح فعال پیدا نشد", 409);
  if (correction && !(await isCorrectionAddressed(tx, application, correction))) throw new ActionError(CORRECTION_NOT_ADDRESSED_MESSAGE, 400);
  if (correction) await tx.facilitiesCorrectionRequest.update({ where: { id: correction.id }, data: { resolvedAt: new Date() } });
  await recordStatusChange(tx, application.id, application.status, ApplicationStatus.SUBMITTED, actorType, actorId, correction ? "اصلاحات متقاضی ارسال شد" : "درخواست پس از تکمیل بررسی‌های نهایی ارسال شد");
  await tx.facilitiesAuditLog.create({
    data: {
      applicationId: application.id,
      actorType,
      actorId,
      action: correction ? FacilitiesAuditAction.CORRECTION_SUBMITTED : FacilitiesAuditAction.APPLICATION_SUBMITTED,
      outcome: AuditOutcome.SUCCEEDED,
      entityType: correction ? "FacilitiesCorrectionRequest" : "FacilitiesApplication",
      entityId: correction?.id ?? application.id,
      metadata: { ...(correction ? { correctionRequestId: correction.id } : {}), previousStatus: application.status, newStatus: ApplicationStatus.SUBMITTED },
    },
  });
  // A correction resubmit charges no new fee, so it gets its own redirect
  // key rather than "success", which the wizard renders as a payment-confirmed
  // banner.
  return { ok: true, state: "submitted", redirectTo: `/dashboard/facilities-application?submitted=${correction ? "corrected" : "success"}` };
}

export async function submitFacilitiesApplication(input: { applicationId: string }): Promise<FacilitiesSubmissionResult> {
  const session = await requireFacilitiesUserSession();
  const result = await db.$transaction(async (tx) => {
    let application = await lockFacilitiesApplication(tx, input.applicationId);
    if (!application || application.userId !== session.subjectId) throw new ActionError("دسترسی به این درخواست امکان‌پذیر نیست", 403);
    if (application.status === ApplicationStatus.SUBMITTED || application.status === ApplicationStatus.VALIDATION_COMPLETED) return { ok: true as const, state: "already-submitted" as const, redirectTo: "/dashboard/facilities-application?submitted=already" };
    if (application.status === ApplicationStatus.DRAFT) {
      try { await refreshFacilitiesProfileSnapshot(tx, application.id); } catch { throw new ActionError("پروفایل شرکت و مدارک آن باید پیش از ارسال کامل باشد", 409); }
      application = await loadFacilitiesSubmissionApplication(tx, application.id);
      if (!application) throw new ActionError("پرونده پیدا نشد", 404);
    }
    if (application.paymentEnabledSnapshot && application.status !== ApplicationStatus.NEEDS_EDIT && !application.payments.some(p => p.status === FacilitiesPaymentStatus.VERIFIED)) throw new ActionError("ابتدا پرداخت را انجام دهید", 409);
    return submitLockedFacilitiesApplication(tx, application, AuditActorType.USER, session.subjectId);
  });
  revalidatePath("/dashboard/facilities-application");
  return result;
}

export async function startFacilitiesPayment(input: { applicationId: string; confirmed: boolean }): Promise<FacilitiesPaymentStartResult> {
  const session = await requireFacilitiesUserSession();
  const reservation = await db.$transaction(async (tx) => {
    let application = await lockFacilitiesApplication(tx, input.applicationId);
    if (!application || application.userId !== session.subjectId) throw new ActionError("دسترسی به این درخواست امکان‌پذیر نیست", 403);
    if (application.status === ApplicationStatus.SUBMITTED || application.status === ApplicationStatus.VALIDATION_COMPLETED) return { kind: "submitted" as const, submitted: { ok: true as const, state: "submitted" as const, redirectTo: "/dashboard/facilities-application?submitted=already" } };

    const capturedPending = application.status === ApplicationStatus.PENDING_PAYMENT && application.payments.find(p => p.status === FacilitiesPaymentStatus.VERIFIED);
    if (capturedPending) return { kind: "existing" as const, payment: capturedPending, payable: false };

    const obligation = application.paymentEnabledSnapshot
      ? await paymentObligation(tx, "facilities", application.id, application.paymentAmountTomanSnapshot!) : null;
    if (obligation && obligation.state !== "READY" && obligation.state !== "SETTLED") {
      const payment = obligation.facilitiesPaymentId ? await tx.facilitiesPaymentAttempt.findUnique({ where: { id: obligation.facilitiesPaymentId } }) : null;
      return { kind: "existing" as const, payment, payable: obligation.state === "PAYABLE" };
    }

    if (application.status === ApplicationStatus.DRAFT) {
      try { await refreshFacilitiesProfileSnapshot(tx, application.id); } catch { throw new ActionError("پروفایل شرکت و مدارک آن باید پیش از پرداخت کامل باشد", 409); }
      application = await loadFacilitiesSubmissionApplication(tx, application.id);
      if (!application) throw new ActionError("پرونده پیدا نشد", 404);
    }

    if (!application.paymentEnabledSnapshot) {
      const submitted = await submitLockedFacilitiesApplication(tx, application, AuditActorType.USER, session.subjectId);
      return { kind: "submitted" as const, submitted };
    }
    if (!input.confirmed) throw new ActionError("برای ادامه، تأیید نهایی اطلاعات را انتخاب کنید");

    const submissionInput = deriveFacilitiesSubmissionInput(application);
    const readiness = checkFacilitiesSubmissionReadiness(application, submissionInput);
    if (!readiness.ready) throw submissionValidationError(readiness.issues);

    await materializeFacilitiesEvidence(tx, application, submissionInput);

    const verifiedPayment = application.payments.find((payment) => payment.status === FacilitiesPaymentStatus.VERIFIED);
    if (verifiedPayment) {
      const submitted = await submitLockedFacilitiesApplication(tx, application, AuditActorType.SYSTEM, "system");
      return { kind: "submitted" as const, submitted };
    }

    if (!obligation || obligation.state !== "READY") return { kind: "existing" as const, payment: null, payable: false };
    await qualifyDocuments(tx, application);
    if (application.status === ApplicationStatus.PENDING_PAYMENT) {
      // No open attempt but still awaiting payment (for example a crash before the
      // attempt row was written): return to draft and start a fresh attempt.
      await returnPaymentApplicationToDraft(tx, application.id);
      application = await loadFacilitiesSubmissionApplication(tx, application.id);
      if (!application) throw new ActionError("پرونده پیدا نشد", 404);
    }
    if (application.status !== ApplicationStatus.DRAFT) throw new ActionError("این درخواست در حال حاضر قابل پرداخت نیست", 409);

    const payment = await tx.facilitiesPaymentAttempt.create({
      data: {
        applicationId: application.id,
        idempotencyKey: randomUUID().replaceAll("-", ""),
        amountToman: application.paymentAmountTomanSnapshot!,
        gateway: "zarinpal",
        status: FacilitiesPaymentStatus.INITIATED,
        safeMetadata: {},
      },
    });
    await recordStatusChange(tx, application.id, application.status, ApplicationStatus.PENDING_PAYMENT, AuditActorType.USER, session.subjectId, "درخواست پرداخت ایجاد شد");
    await tx.facilitiesAuditLog.create({
      data: {
        applicationId: application.id,
        actorType: AuditActorType.USER,
        actorId: session.subjectId,
        action: FacilitiesAuditAction.PAYMENT_INITIATED,
        outcome: AuditOutcome.SUCCEEDED,
        entityType: "FacilitiesPaymentAttempt",
        entityId: payment.id,
        metadata: { paymentAttemptId: payment.id, status: FacilitiesPaymentStatus.INITIATED },
      },
    });
    const claim = await claimPaymentOperation(tx, obligation, "REQUEST", payment.id);
    return { kind: "new" as const, payment, claim, mobile: application.user.mobile };
  });

  if (reservation.kind === "submitted") {
    revalidatePath("/dashboard/facilities-application");
    return { ok: true, state: "submitted", redirectTo: reservation.submitted.redirectTo };
  }
  if (reservation.kind === "existing") {
    if (reservation.payment?.authority && reservation.payable) return { ok: true, state: "redirect", redirectTo: existingPaymentUrl(reservation.payment.authority) };
    if (reservation.payment?.authority) {
      const outcome = await verifyFacilitiesPaymentCallback({ paymentId: reservation.payment.id, authority: reservation.payment.authority, gatewayStatus: "OK" });
      if (outcome.state === "success") return { ok: true, state: "submitted", redirectTo: "/dashboard/facilities-application?payment=success" };
    }
    return { ok: true, state: "pending", message: PAYMENT_PENDING_MESSAGE };
  }

  try {
    const gateway = await requestZarinpalPayment({
      amountToman: reservation.payment.amountToman,
      description: "پرداخت درخواست تسهیلات سامانه سانا",
      callbackUrl: appUrl(`/api/facilities/payment/callback?paymentId=${encodeURIComponent(reservation.payment.id)}`),
      mobile: reservation.mobile,
    });
    const ready = await finishPaymentRequest(reservation.claim, "facilities", reservation.payment.applicationId, reservation.payment.id, gateway.authority, async (tx) => {
      await tx.facilitiesPaymentAttempt.update({ where: { id: reservation.payment.id }, data: { authority: gateway.authority, status: FacilitiesPaymentStatus.REDIRECT_READY, safeMetadata: { status: FacilitiesPaymentStatus.REDIRECT_READY } } });
      await tx.facilitiesAuditLog.create({ data: { applicationId: reservation.payment.applicationId, actorType: AuditActorType.SYSTEM, action: FacilitiesAuditAction.PAYMENT_REDIRECT_READY, outcome: AuditOutcome.SUCCEEDED, entityType: "FacilitiesPaymentAttempt", entityId: reservation.payment.id, metadata: { paymentAttemptId: reservation.payment.id, status: FacilitiesPaymentStatus.REDIRECT_READY } } });
    });
    if (!ready) return { ok: true, state: "pending", message: PAYMENT_PENDING_MESSAGE };
    return { ok: true, state: "redirect", redirectTo: gateway.paymentUrl };
  } catch (error) {
    logger.error("facilities_payment_request_persist_or_transport_failed", error, { applicationId: reservation.payment.applicationId });
    await savePaymentResult(reservation.claim, "UNKNOWN").catch(() => undefined);
    await markPaymentUncertain(reservation.claim, "REQUEST_UNRESOLVED").catch(() => undefined);
    logger.warn("facilities_payment_start_unresolved", { applicationId: reservation.payment.applicationId });
    return { ok: true, state: "pending", message: PAYMENT_PENDING_MESSAGE };
  }
}

/**
 * Second phase of a verified payment: move the application to SUBMITTED. The
 * money is already confirmed and recorded, so a failure here (readiness drift,
 * database error) is logged and audited but still reported as a successful
 * payment; the wizard then shows "paid, not submitted" and the next submit click
 * completes it through the verified-payment branch of startFacilitiesPayment.
 */
async function completeVerifiedFacilitiesSubmission(input: { paymentAttemptId: string; applicationId: string; amountToman: number }): Promise<{ state: "success" }> {
  try {
    await db.$transaction(async (tx) => {
      const application = await lockFacilitiesApplication(tx, input.applicationId);
      if (!application) throw new ActionError("درخواست پیدا نشد", 404);
      if (application.status !== ApplicationStatus.DRAFT && application.status !== ApplicationStatus.PENDING_PAYMENT) return;
      if (input.amountToman !== application.paymentAmountTomanSnapshot) throw new ActionError("اطلاعات پرداخت معتبر نیست", 400);
      const submissionInput = { employeeCount: application.evidence.find((item) => item.kind === "insurance")?.employeeCount ?? -1, boardOfficerId: application.evidence.find((item) => item.kind === "credit-board")?.officerId ?? "" };
      const readiness = checkFacilitiesSubmissionReadiness(application, submissionInput);
      try {
        if (!readiness.ready) throw new DocumentQualificationError("required", "مدارک الزامی درخواست");
        await qualifyFacilitiesDocuments(tx, application);
      } catch (error) {
        if (!(error instanceof DocumentQualificationError)) throw error;
        if (application.status === ApplicationStatus.PENDING_PAYMENT) {
          await recordStatusChange(tx, application.id, application.status, ApplicationStatus.DRAFT, AuditActorType.SYSTEM, "system", "پرداخت ثبت شد؛ مدارک را تکمیل و بدون پرداخت دوباره ارسال کنید");
          await tx.facilitiesAuditLog.create({ data: { applicationId: application.id, actorType: AuditActorType.SYSTEM, actorId: "system", action: FacilitiesAuditAction.APPLICATION_SUBMITTED, outcome: AuditOutcome.FAILED, entityType: "FacilitiesApplication", entityId: application.id, metadata: { reasonCode: "PAID_DOCUMENT_REPAIR_REQUIRED" } } });
        }
        return;
      }
      await materializeFacilitiesEvidence(tx, application, submissionInput);
      await recordStatusChange(tx, application.id, application.status, ApplicationStatus.SUBMITTED, AuditActorType.SYSTEM, "system", "پرداخت با موفقیت تأیید و درخواست ارسال شد");
      await tx.facilitiesAuditLog.create({ data: { applicationId: application.id, actorType: AuditActorType.SYSTEM, actorId: "system", action: FacilitiesAuditAction.APPLICATION_SUBMITTED, outcome: AuditOutcome.SUCCEEDED, entityType: "FacilitiesApplication", entityId: application.id, metadata: { previousStatus: application.status, newStatus: ApplicationStatus.SUBMITTED, paymentAttemptId: input.paymentAttemptId } } });
    });
  } catch (error) {
    logger.error("facilities_post_verify_submission_failed", error, { paymentAttemptId: input.paymentAttemptId, applicationId: input.applicationId });
    await db.facilitiesAuditLog.create({ data: { applicationId: input.applicationId, actorType: AuditActorType.SYSTEM, actorId: "system", action: FacilitiesAuditAction.APPLICATION_SUBMITTED, outcome: AuditOutcome.FAILED, entityType: "FacilitiesApplication", entityId: input.applicationId, metadata: { paymentAttemptId: input.paymentAttemptId, reasonCode: "POST_VERIFY_SUBMISSION_FAILED" } } }).catch(() => undefined);
  }
  return { state: "success" as const };
}

export async function verifyFacilitiesPaymentCallback(input: { paymentId: string; authority: string; gatewayStatus: string | null }) {
  const payment = await db.facilitiesPaymentAttempt.findUnique({ where: { id: input.paymentId }, include: { application: { include: facilitiesSubmissionInclude } } });
  if (!payment || payment.authority !== input.authority) return { state: "failed" as const };
  if (payment.status === FacilitiesPaymentStatus.VERIFIED) {
    // Idempotent re-delivery. If an earlier post-verify submission failed, this retries it.
    return completeVerifiedFacilitiesSubmission({ paymentAttemptId: payment.id, applicationId: payment.applicationId, amountToman: payment.amountToman });
  }

  if (!LOCKED_PAYMENT_STATES.includes(payment.status) && input.gatewayStatus !== "OK") return { state: "failed" as const };

  const reservation = await beginPaymentVerification("facilities", payment.applicationId, payment.id, payment.amountToman, input.authority).catch(() => null);
  if (!reservation) return { state: "pending" as const };
  if (reservation.kind === "settled") {
    if (reservation.obligation.facilitiesPaymentId === payment.id) return completeVerifiedFacilitiesSubmission({ paymentAttemptId: payment.id, applicationId: payment.applicationId, amountToman: payment.amountToman });
    return { state: "success" as const };
  }
  if (reservation.kind === "pending") return { state: "pending" as const };
  let verified: { referenceId: string };
  if (reservation.kind === "captured") verified = { referenceId: reservation.referenceId };
  else {
    try {
      verified = await verifyZarinpalPayment({ amountToman: reservation.obligation.amountToman, authority: input.authority });
    } catch (error) {
      await savePaymentResult(reservation.claim, isZarinpalRejection(error) ? "REJECTED" : "UNKNOWN", { authority: input.authority }).catch(() => undefined);
      await markPaymentUncertain(reservation.claim, "VERIFY_UNRESOLVED").catch(() => undefined);
      return { state: "pending" as const };
    }
    try { await savePaymentResult(reservation.claim, "CAPTURED", { authority: input.authority, referenceId: verified.referenceId }); }
    catch { return { state: "pending" as const }; }
  }

  // First phase: record the confirmed payment on its own, with no business-rule
  // preconditions, so a later submission problem can never lose the fact that
  // the gateway captured the money. The status is re-read under the row lock:
  // a closed attempt confirmed by the gateway is recorded as a late capture.
  try {
    await db.$transaction(async (tx) => {
      await lockPaymentApplication(tx, "facilities", payment.applicationId);
      const current = await lockFacilitiesPayment(tx, payment.id);
      if (!current) throw new ActionError("پرداخت پیدا نشد", 404);
      if (current.status === FacilitiesPaymentStatus.VERIFIED) return;
      if (current.authority !== input.authority) throw new ActionError("اطلاعات پرداخت معتبر نیست", 400);
      const late = !LOCKED_PAYMENT_STATES.includes(current.status);
      const metadata = late ? { status: FacilitiesPaymentStatus.VERIFIED, reasonCode: "LATE_CAPTURE" } : { status: FacilitiesPaymentStatus.VERIFIED };
      await tx.facilitiesPaymentAttempt.update({ where: { id: current.id }, data: { status: FacilitiesPaymentStatus.VERIFIED, referenceId: verified.referenceId, safeMetadata: metadata } });
      await tx.facilitiesAuditLog.create({ data: { applicationId: current.applicationId, actorType: AuditActorType.SYSTEM, action: FacilitiesAuditAction.PAYMENT_VERIFIED, outcome: AuditOutcome.SUCCEEDED, entityType: "FacilitiesPaymentAttempt", entityId: current.id, metadata: { paymentAttemptId: current.id, ...metadata } } });
      await tx.paymentObligation.update({ where: { id: reservation.obligation.id }, data: { state: "SETTLED", reason: null } });
      if (late) logger.warn("facilities_payment_late_capture_recorded", { paymentAttemptId: current.id, applicationId: current.applicationId, previousStatus: current.status });
    });
  } catch (error) {
    logger.error("facilities_payment_verification_record_failed", error, { paymentAttemptId: payment.id, applicationId: payment.applicationId });
    return { state: "pending" as const };
  }

  return completeVerifiedFacilitiesSubmission({ paymentAttemptId: payment.id, applicationId: payment.applicationId, amountToman: payment.amountToman });
}
