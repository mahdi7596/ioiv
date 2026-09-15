"use server";

import { randomUUID } from "node:crypto";
import { ApplicationStatus, AuditActorType, AuditOutcome, FacilitiesAuditAction, FacilitiesPaymentStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { ActionError } from "@/lib/actions/auth";
import { db } from "@/lib/db";
import { requestZarinpalPayment, verifyZarinpalPayment } from "@/lib/payments/zarinpal";
import { logger } from "@/lib/logger";
import { requireAppUrl } from "@/lib/app-url";
import { checkFacilitiesSubmissionReadiness, facilitiesSubmissionInclude, loadFacilitiesSubmissionApplication, materializeFacilitiesEvidence, refreshFacilitiesProfileSnapshot, type FacilitiesSubmissionInput } from "@/lib/facilities/submission";

const ACTIVE_PAYMENT_STATES: FacilitiesPaymentStatus[] = [
  FacilitiesPaymentStatus.INITIATED,
  FacilitiesPaymentStatus.REDIRECT_READY,
  FacilitiesPaymentStatus.PENDING,
];
const LOCKED_PAYMENT_STATES: FacilitiesPaymentStatus[] = [...ACTIVE_PAYMENT_STATES, FacilitiesPaymentStatus.TIMED_OUT];

/**
 * An open attempt older than this is treated as abandoned: without an authority
 * nothing reached the gateway and it is failed; with one it is re-verified so a
 * payment whose callback never arrived (or whose post-verify submission failed)
 * completes instead of blocking the applicant forever.
 */
const STALE_PAYMENT_ATTEMPT_MS = 20 * 60 * 1000;

const PAYMENT_PENDING_MESSAGE = "وضعیت پرداخت هنوز مشخص نیست. لطفاً کمی بعد دوباره صفحه را بررسی کنید.";
const PAYMENT_FAILED_MESSAGE = "پرداخت انجام نشد. می‌توانید دوباره تلاش کنید.";
const SUBMISSION_VALIDATION_MESSAGE = "همه اطلاعات و مدارک الزامی باید کامل و بررسی‌شده باشند.";

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

function isStaleAttempt(updatedAt: Date | string | null | undefined, now: number) {
  const timestamp = updatedAt ? new Date(updatedAt).getTime() : Number.NaN;
  return Number.isFinite(timestamp) && now - timestamp >= STALE_PAYMENT_ATTEMPT_MS;
}

function safePaymentMetadata(reasonCode: string, status: FacilitiesPaymentStatus) {
  return { reasonCode, status } satisfies Prisma.InputJsonObject;
}

function classifyStartFailure(error: unknown): "failed" | "timed-out" {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("Zarinpal request failed") || message.includes("MERCHANT_ID")) return "failed";
  return "timed-out";
}

function classifyVerificationFailure(error: unknown): "failed" | "pending" {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("Zarinpal request failed")) return "failed";
  return "pending";
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
  input: FacilitiesSubmissionInput,
  actorType: AuditActorType,
  actorId: string,
): Promise<FacilitiesSubmissionResult> {
  if (application.status === ApplicationStatus.SUBMITTED || application.status === ApplicationStatus.VALIDATION_COMPLETED) {
    return { ok: true, state: "already-submitted", redirectTo: "/dashboard/facilities-application?submitted=already" };
  }

  if (application.status !== ApplicationStatus.DRAFT && application.status !== ApplicationStatus.PENDING_PAYMENT && application.status !== ApplicationStatus.NEEDS_EDIT) {
    throw new ActionError("این درخواست در حال حاضر قابل ارسال نیست", 409);
  }

  const readiness = checkFacilitiesSubmissionReadiness(application, input);
  if (!readiness.ready) throw new ActionError(SUBMISSION_VALIDATION_MESSAGE, 400);

  const verifiedPayment = application.payments.find(
    (payment) => payment.status === FacilitiesPaymentStatus.VERIFIED && payment.amountToman === application.paymentAmountTomanSnapshot,
  );
  if (application.paymentEnabledSnapshot && !verifiedPayment) {
    throw new ActionError("ابتدا پرداخت را با موفقیت انجام دهید", 409);
  }

  await materializeFacilitiesEvidence(tx, application, input);
  const correction = application.status === ApplicationStatus.NEEDS_EDIT
    ? await tx.facilitiesCorrectionRequest.findFirst({ where: { applicationId: application.id, resolvedAt: null } })
    : null;
  if (application.status === ApplicationStatus.NEEDS_EDIT && !correction) throw new ActionError("درخواست اصلاح فعال پیدا نشد", 409);
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
  return { ok: true, state: "submitted", redirectTo: "/dashboard/facilities-application?submitted=success" };
}

export async function submitFacilitiesApplication(input: FacilitiesSubmissionInput & { applicationId: string }): Promise<FacilitiesSubmissionResult> {
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
    if (application.paymentEnabledSnapshot && application.status !== ApplicationStatus.NEEDS_EDIT) throw new ActionError("ابتدا پرداخت را انجام دهید", 409);
    return submitLockedFacilitiesApplication(tx, application, input, AuditActorType.USER, session.subjectId);
  });
  revalidatePath("/dashboard/facilities-application");
  return result;
}

export async function startFacilitiesPayment(input: { applicationId: string; confirmed: boolean; employeeCount: number; boardOfficerId: string }): Promise<FacilitiesPaymentStartResult> {
  const session = await requireFacilitiesUserSession();
  const reservation = await db.$transaction(async (tx) => {
    let application = await lockFacilitiesApplication(tx, input.applicationId);
    if (!application || application.userId !== session.subjectId) throw new ActionError("دسترسی به این درخواست امکان‌پذیر نیست", 403);
    if (application.status === ApplicationStatus.SUBMITTED || application.status === ApplicationStatus.VALIDATION_COMPLETED) return { kind: "submitted" as const, submitted: { ok: true as const, state: "submitted" as const, redirectTo: "/dashboard/facilities-application?submitted=already" } };

    if (application.status === ApplicationStatus.DRAFT) {
      try { await refreshFacilitiesProfileSnapshot(tx, application.id); } catch { throw new ActionError("پروفایل شرکت و مدارک آن باید پیش از پرداخت کامل باشد", 409); }
      application = await loadFacilitiesSubmissionApplication(tx, application.id);
      if (!application) throw new ActionError("پرونده پیدا نشد", 404);
    }

    if (!application.paymentEnabledSnapshot) {
      const submitted = await submitLockedFacilitiesApplication(tx, application, input, AuditActorType.USER, session.subjectId);
      return { kind: "submitted" as const, submitted };
    }
    if (!input.confirmed) throw new ActionError("برای ادامه، تأیید نهایی اطلاعات را انتخاب کنید");

    const readiness = checkFacilitiesSubmissionReadiness(application, input);
    if (!readiness.ready) throw new ActionError(SUBMISSION_VALIDATION_MESSAGE);

    await materializeFacilitiesEvidence(tx, application, input);

    const verifiedPayment = application.payments.find((payment) => payment.status === FacilitiesPaymentStatus.VERIFIED);
    if (verifiedPayment) {
      const submitted = await submitLockedFacilitiesApplication(tx, application, input, AuditActorType.SYSTEM, "system");
      return { kind: "submitted" as const, submitted };
    }

    const activePayment = application.payments.find((payment) => LOCKED_PAYMENT_STATES.includes(payment.status as FacilitiesPaymentStatus));
    if (activePayment) {
      const stale = isStaleAttempt(activePayment.updatedAt, Date.now());
      if (stale && !activePayment.authority) {
        // Nothing reached the gateway, so no money can have moved: close the
        // attempt and let the applicant start a fresh one.
        await tx.facilitiesPaymentAttempt.update({ where: { id: activePayment.id }, data: { status: FacilitiesPaymentStatus.FAILED, safeMetadata: safePaymentMetadata("STALE_NO_AUTHORITY", FacilitiesPaymentStatus.FAILED) } });
        await tx.facilitiesAuditLog.create({ data: { applicationId: application.id, actorType: AuditActorType.SYSTEM, action: FacilitiesAuditAction.PAYMENT_FAILED, outcome: AuditOutcome.FAILED, entityType: "FacilitiesPaymentAttempt", entityId: activePayment.id, metadata: { paymentAttemptId: activePayment.id, status: FacilitiesPaymentStatus.FAILED, reasonCode: "STALE_NO_AUTHORITY" } } });
        await returnPaymentApplicationToDraft(tx, application.id);
        return { kind: "stale-failed" as const, payment: activePayment };
      }
      if (stale && activePayment.authority) return { kind: "reverify" as const, payment: activePayment };
      return { kind: "active" as const, payment: activePayment, mobile: application.user.mobile };
    }
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
    return { kind: "new" as const, payment, mobile: application.user.mobile };
  });

  if (reservation.kind === "submitted") {
    revalidatePath("/dashboard/facilities-application");
    return { ok: true, state: "submitted", redirectTo: reservation.submitted.redirectTo };
  }
  if (reservation.kind === "stale-failed") {
    logger.warn("facilities_payment_stale_attempt_failed", { applicationId: input.applicationId, paymentAttemptId: reservation.payment.id, previousStatus: reservation.payment.status });
    revalidatePath("/dashboard/facilities-application");
    return { ok: false, state: "failed", message: PAYMENT_FAILED_MESSAGE };
  }
  if (reservation.kind === "reverify") {
    logger.info("facilities_payment_stale_attempt_reverify", { applicationId: input.applicationId, paymentAttemptId: reservation.payment.id, previousStatus: reservation.payment.status });
    const outcome = await verifyFacilitiesPaymentCallback({ paymentId: reservation.payment.id, authority: reservation.payment.authority!, gatewayStatus: "OK" });
    revalidatePath("/dashboard/facilities-application");
    if (outcome.state === "success") return { ok: true, state: "submitted", redirectTo: "/dashboard/facilities-application?payment=success" };
    if (outcome.state === "failed") return { ok: false, state: "failed", message: PAYMENT_FAILED_MESSAGE };
    return { ok: true, state: "pending", message: PAYMENT_PENDING_MESSAGE };
  }
  if (reservation.kind === "active") {
    if (reservation.payment.authority && reservation.payment.status === FacilitiesPaymentStatus.REDIRECT_READY) {
      return { ok: true, state: "redirect", redirectTo: `${process.env.ZARINPAL_SANDBOX === "true" ? "https://sandbox.zarinpal.com" : "https://payment.zarinpal.com"}/pg/StartPay/${reservation.payment.authority}` };
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
    await db.$transaction(async (tx) => {
      const current = await tx.facilitiesPaymentAttempt.findUnique({ where: { id: reservation.payment.id } });
      if (!current || current.status !== FacilitiesPaymentStatus.INITIATED) return;
      await tx.facilitiesPaymentAttempt.update({ where: { id: current.id }, data: { authority: gateway.authority, status: FacilitiesPaymentStatus.REDIRECT_READY, safeMetadata: { status: FacilitiesPaymentStatus.REDIRECT_READY } } });
      await tx.facilitiesAuditLog.create({ data: { applicationId: reservation.payment.applicationId, actorType: AuditActorType.SYSTEM, action: FacilitiesAuditAction.PAYMENT_REDIRECT_READY, outcome: AuditOutcome.SUCCEEDED, entityType: "FacilitiesPaymentAttempt", entityId: current.id, metadata: { paymentAttemptId: current.id, status: FacilitiesPaymentStatus.REDIRECT_READY } } });
    });
    return { ok: true, state: "redirect", redirectTo: gateway.paymentUrl };
  } catch (error) {
    const failure = classifyStartFailure(error);
    await db.$transaction(async (tx) => {
      const current = await tx.facilitiesPaymentAttempt.findUnique({ where: { id: reservation.payment.id } });
      if (!current || !LOCKED_PAYMENT_STATES.includes(current.status)) return;
      if (current.status === FacilitiesPaymentStatus.TIMED_OUT) return;
      const nextStatus = failure === "failed" ? FacilitiesPaymentStatus.FAILED : FacilitiesPaymentStatus.TIMED_OUT;
      await tx.facilitiesPaymentAttempt.update({ where: { id: current.id }, data: { status: nextStatus, safeMetadata: safePaymentMetadata(failure === "failed" ? "GATEWAY_REJECTED" : "GATEWAY_UNKNOWN", nextStatus) } });
      await tx.facilitiesAuditLog.create({ data: { applicationId: current.applicationId, actorType: AuditActorType.SYSTEM, action: failure === "failed" ? FacilitiesAuditAction.PAYMENT_FAILED : FacilitiesAuditAction.PAYMENT_TIMED_OUT, outcome: failure === "failed" ? AuditOutcome.FAILED : AuditOutcome.REJECTED, entityType: "FacilitiesPaymentAttempt", entityId: current.id, metadata: { paymentAttemptId: current.id, status: nextStatus, reasonCode: failure === "failed" ? "GATEWAY_REJECTED" : "GATEWAY_UNKNOWN" } } });
      if (failure === "failed") {
        await returnPaymentApplicationToDraft(tx, current.applicationId);
      }
    });
    logger.warn("facilities_payment_start_failed", { applicationId: reservation.payment.applicationId, paymentAttemptId: reservation.payment.id, reason: failure });
    if (failure === "failed") return { ok: false, state: "failed", message: PAYMENT_FAILED_MESSAGE };
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
      if (!readiness.ready) throw new ActionError(SUBMISSION_VALIDATION_MESSAGE, 409);
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
  if (!LOCKED_PAYMENT_STATES.includes(payment.status)) {
    // The attempt was already closed (for example failed by a stale re-verify while
    // the applicant lingered on the gateway page). Support reconciles from this log.
    logger.warn("facilities_callback_for_terminal_attempt", { paymentAttemptId: payment.id, applicationId: payment.applicationId, status: payment.status, gatewayStatus: input.gatewayStatus });
    return { state: "failed" as const };
  }

  let verified: { referenceId: string };
  try {
    verified = await verifyZarinpalPayment({ amountToman: payment.amountToman, authority: input.authority });
  } catch (error) {
    const failure = classifyVerificationFailure(error);
    if (failure === "pending") return { state: "pending" as const };
    if (payment.status === FacilitiesPaymentStatus.TIMED_OUT) return { state: "pending" as const };
    await db.$transaction(async (tx) => {
      const current = await lockFacilitiesPayment(tx, payment.id);
      if (!current || !ACTIVE_PAYMENT_STATES.includes(current.status)) return;
      const nextStatus = input.gatewayStatus === "OK" ? FacilitiesPaymentStatus.FAILED : FacilitiesPaymentStatus.CANCELLED;
      const reasonCode = input.gatewayStatus === "OK" ? "VERIFICATION_REJECTED" : "GATEWAY_CANCELLED";
      await tx.facilitiesPaymentAttempt.update({ where: { id: current.id }, data: { status: nextStatus, safeMetadata: safePaymentMetadata(reasonCode, nextStatus) } });
      await tx.facilitiesAuditLog.create({ data: { applicationId: current.applicationId, actorType: AuditActorType.SYSTEM, action: nextStatus === FacilitiesPaymentStatus.CANCELLED ? FacilitiesAuditAction.PAYMENT_CANCELLED : FacilitiesAuditAction.PAYMENT_FAILED, outcome: AuditOutcome.FAILED, entityType: "FacilitiesPaymentAttempt", entityId: current.id, metadata: { paymentAttemptId: current.id, status: nextStatus, reasonCode } } });
      await returnPaymentApplicationToDraft(tx, current.applicationId);
    });
    return { state: "failed" as const };
  }

  // First phase: record the confirmed payment on its own, with no business-rule
  // preconditions, so a later submission problem can never lose the fact that
  // the gateway captured the money.
  try {
    await db.$transaction(async (tx) => {
      const current = await lockFacilitiesPayment(tx, payment.id);
      if (!current) throw new ActionError("پرداخت پیدا نشد", 404);
      if (current.status === FacilitiesPaymentStatus.VERIFIED) return;
      if (!LOCKED_PAYMENT_STATES.includes(current.status)) throw new ActionError("وضعیت پرداخت معتبر نیست", 409);
      if (current.authority !== input.authority) throw new ActionError("اطلاعات پرداخت معتبر نیست", 400);
      await tx.facilitiesPaymentAttempt.update({ where: { id: current.id }, data: { status: FacilitiesPaymentStatus.VERIFIED, referenceId: verified.referenceId, safeMetadata: { status: FacilitiesPaymentStatus.VERIFIED } } });
      await tx.facilitiesAuditLog.create({ data: { applicationId: current.applicationId, actorType: AuditActorType.SYSTEM, action: FacilitiesAuditAction.PAYMENT_VERIFIED, outcome: AuditOutcome.SUCCEEDED, entityType: "FacilitiesPaymentAttempt", entityId: current.id, metadata: { paymentAttemptId: current.id, status: FacilitiesPaymentStatus.VERIFIED } } });
    });
  } catch (error) {
    logger.error("facilities_payment_verification_record_failed", error, { paymentAttemptId: payment.id, applicationId: payment.applicationId });
    return { state: "pending" as const };
  }

  return completeVerifiedFacilitiesSubmission({ paymentAttemptId: payment.id, applicationId: payment.applicationId, amountToman: payment.amountToman });
}
