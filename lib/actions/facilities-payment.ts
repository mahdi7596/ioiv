"use server";

import { randomUUID } from "node:crypto";
import { ApplicationStatus, AuditActorType, AuditOutcome, FacilitiesAuditAction, FacilitiesPaymentStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { ActionError } from "@/lib/actions/auth";
import { db } from "@/lib/db";
import { requestZarinpalPayment, verifyZarinpalPayment } from "@/lib/payments/zarinpal";
import { logger } from "@/lib/logger";
import { checkFacilitiesSubmissionReadiness, facilitiesSubmissionInclude, loadFacilitiesSubmissionApplication, materializeFacilitiesEvidence, refreshFacilitiesProfileSnapshot, type FacilitiesSubmissionInput } from "@/lib/facilities/submission";

const ACTIVE_PAYMENT_STATES: FacilitiesPaymentStatus[] = [
  FacilitiesPaymentStatus.INITIATED,
  FacilitiesPaymentStatus.REDIRECT_READY,
  FacilitiesPaymentStatus.PENDING,
];
const LOCKED_PAYMENT_STATES: FacilitiesPaymentStatus[] = [...ACTIVE_PAYMENT_STATES, FacilitiesPaymentStatus.TIMED_OUT];

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
  return new URL(path, process.env.APP_URL || "http://localhost:3000").toString();
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
  await recordStatusChange(tx, application.id, application.status, ApplicationStatus.SUBMITTED, actorType, actorId, correction ? "اصلاحات متقاضی ارسال شد" : "درخواست پس از تکمیل بررسی‌های سرور ارسال شد");
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
    if (activePayment) return { kind: "active" as const, payment: activePayment, mobile: application.user.mobile };
    if (application.status !== ApplicationStatus.DRAFT) return { kind: "active" as const, payment: { status: FacilitiesPaymentStatus.PENDING, authority: null, amountToman: application.paymentAmountTomanSnapshot!, id: "pending", applicationId: application.id }, mobile: application.user.mobile };

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

export async function verifyFacilitiesPaymentCallback(input: { paymentId: string; authority: string; gatewayStatus: string | null }) {
  const payment = await db.facilitiesPaymentAttempt.findUnique({ where: { id: input.paymentId }, include: { application: { include: facilitiesSubmissionInclude } } });
  if (!payment || payment.authority !== input.authority) return { state: "failed" as const };
  if (payment.status === FacilitiesPaymentStatus.VERIFIED) return { state: "success" as const };
  if (!LOCKED_PAYMENT_STATES.includes(payment.status)) return { state: payment.status === FacilitiesPaymentStatus.TIMED_OUT ? "pending" as const : "failed" as const };

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

  try {
    await db.$transaction(async (tx) => {
      const current = await lockFacilitiesPayment(tx, payment.id);
      if (!current) throw new ActionError("پرداخت پیدا نشد", 404);
      if (current.status === FacilitiesPaymentStatus.VERIFIED) return;
      if (!LOCKED_PAYMENT_STATES.includes(current.status)) throw new ActionError("وضعیت پرداخت معتبر نیست", 409);
      const application = await loadFacilitiesSubmissionApplication(tx, current.applicationId);
      if (!application) throw new ActionError("درخواست پیدا نشد", 404);
      if (current.authority !== input.authority || current.amountToman !== application.paymentAmountTomanSnapshot) throw new ActionError("اطلاعات پرداخت معتبر نیست", 400);
      const readiness = checkFacilitiesSubmissionReadiness(application, { employeeCount: application.evidence.find((item) => item.kind === "insurance")?.employeeCount ?? -1, boardOfficerId: application.evidence.find((item) => item.kind === "credit-board")?.officerId ?? "" });
      if (!readiness.ready) throw new ActionError(SUBMISSION_VALIDATION_MESSAGE, 409);
      if (current.status !== FacilitiesPaymentStatus.TIMED_OUT && current.status !== FacilitiesPaymentStatus.PENDING) {
        await tx.facilitiesPaymentAttempt.update({ where: { id: current.id }, data: { status: FacilitiesPaymentStatus.PENDING, safeMetadata: { status: FacilitiesPaymentStatus.PENDING } } });
        await tx.facilitiesAuditLog.create({ data: { applicationId: current.applicationId, actorType: AuditActorType.SYSTEM, action: FacilitiesAuditAction.PAYMENT_PENDING, outcome: AuditOutcome.REJECTED, entityType: "FacilitiesPaymentAttempt", entityId: current.id, metadata: { paymentAttemptId: current.id, status: FacilitiesPaymentStatus.PENDING } } });
      }
      await tx.facilitiesPaymentAttempt.update({ where: { id: current.id }, data: { status: FacilitiesPaymentStatus.VERIFIED, referenceId: verified.referenceId, safeMetadata: { status: FacilitiesPaymentStatus.VERIFIED } } });
      await tx.facilitiesAuditLog.create({ data: { applicationId: current.applicationId, actorType: AuditActorType.SYSTEM, action: FacilitiesAuditAction.PAYMENT_VERIFIED, outcome: AuditOutcome.SUCCEEDED, entityType: "FacilitiesPaymentAttempt", entityId: current.id, metadata: { paymentAttemptId: current.id, status: FacilitiesPaymentStatus.VERIFIED } } });
      await materializeFacilitiesEvidence(tx, application, { employeeCount: application.evidence.find((item) => item.kind === "insurance")?.employeeCount ?? 0, boardOfficerId: application.evidence.find((item) => item.kind === "credit-board")?.officerId ?? "" });
      await recordStatusChange(tx, application.id, application.status, ApplicationStatus.SUBMITTED, AuditActorType.SYSTEM, "system", "پرداخت با موفقیت تأیید و درخواست ارسال شد");
      await tx.facilitiesAuditLog.create({ data: { applicationId: application.id, actorType: AuditActorType.SYSTEM, actorId: "system", action: FacilitiesAuditAction.APPLICATION_SUBMITTED, outcome: AuditOutcome.SUCCEEDED, entityType: "FacilitiesApplication", entityId: application.id, metadata: { previousStatus: application.status, newStatus: ApplicationStatus.SUBMITTED } } });
    });
    return { state: "success" as const };
  } catch (error) {
    if (error instanceof ActionError && error.status === 409) return { state: "pending" as const };
    return { state: "pending" as const };
  }
}
