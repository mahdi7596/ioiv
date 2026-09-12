"use server";

import { ApplicationStatus, AuditActorType, AuditOutcome, FacilitiesAuditAction, FacilitiesCorrectionSmsStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { ActionError } from "@/lib/actions/auth";
import { requireFacilitiesAdmin, getFacilitiesAdminAccess } from "@/lib/admin/facilities-access";
import { db } from "@/lib/db";
import { logger, maskMobile } from "@/lib/logger";
import { sendSms } from "@/lib/sms";
import { createFacilitiesCorrectionSmsMessage } from "@/lib/sms/messages";
import { FACILITIES_REVIEW_VISIBLE_STATUSES } from "@/lib/facilities/review-status";

const CORRECTION_NOTE_MAX = 2000;
const PERSIAN_TEXT_PATTERN = /[\u0600-\u06ff]/u;

const safeFileSelect = {
  id: true,
  originalName: true,
  fileType: true,
  byteSize: true,
  scanStatus: true,
} as const;

function refreshFacilitiesReviewPaths(applicationId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/facilities/applications");
  revalidatePath(`/admin/facilities/applications/${applicationId}`);
  revalidatePath("/dashboard/facilities-application");
}

async function lockReviewApplication(tx: Prisma.TransactionClient, applicationId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "FacilitiesApplication" WHERE "id" = ${applicationId} FOR UPDATE`;
  if (!rows.length) throw new ActionError("پرونده پیدا نشد", 404);
  return tx.facilitiesApplication.findUniqueOrThrow({ where: { id: applicationId } });
}

function safeSmsFailureCode(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("timeout") || message.includes("abort") ? "PROVIDER_TIMEOUT" : "PROVIDER_ERROR";
}

async function claimCorrectionSms(correctionId: string, requireFailed: boolean) {
  return db.$transaction(async (tx) => {
    const correction = await tx.facilitiesCorrectionRequest.findUnique({
      where: { id: correctionId },
      include: { application: { include: { user: { select: { mobile: true } } } } },
    });
    if (!correction) throw new ActionError("درخواست اصلاح پیدا نشد", 404);
    if (correction.smsStatus === FacilitiesCorrectionSmsStatus.SENT) return null;
    if (requireFailed && correction.smsStatus !== FacilitiesCorrectionSmsStatus.FAILED) {
      throw new ActionError("این پیامک در وضعیت قابل تلاش مجدد نیست", 409);
    }
    const claimed = await tx.facilitiesCorrectionRequest.updateMany({
      where: { id: correction.id, smsAttemptCount: correction.smsAttemptCount, smsStatus: correction.smsStatus },
      data: {
        smsStatus: FacilitiesCorrectionSmsStatus.PENDING,
        smsAttemptCount: { increment: 1 },
        smsLastAttemptAt: new Date(),
        smsSentAt: null,
        smsFailureCode: null,
      },
    });
    if (claimed.count !== 1) throw new ActionError("ارسال پیامک دیگری هم‌اکنون در حال انجام است", 409);
    return { id: correction.id, applicationId: correction.applicationId, mobile: correction.application.user.mobile };
  });
}

async function deliverCorrectionSms(correctionId: string, requireFailed = false) {
  const claimed = await claimCorrectionSms(correctionId, requireFailed);
  if (!claimed) return { sent: true as const };
  try {
    await sendSms(createFacilitiesCorrectionSmsMessage(claimed.mobile, claimed.id));
    await db.$transaction(async (tx) => {
      await tx.facilitiesCorrectionRequest.update({
        where: { id: claimed.id },
        data: { smsStatus: FacilitiesCorrectionSmsStatus.SENT, smsSentAt: new Date(), smsFailureCode: null },
      });
      await tx.facilitiesAuditLog.create({
        data: {
          applicationId: claimed.applicationId,
          actorType: AuditActorType.SYSTEM,
          actorId: "system",
          action: FacilitiesAuditAction.CORRECTION_SMS_SENT,
          outcome: AuditOutcome.SUCCEEDED,
          entityType: "FacilitiesCorrectionRequest",
          entityId: claimed.id,
          metadata: { correctionRequestId: claimed.id },
        },
      });
    });
    return { sent: true as const };
  } catch (error) {
    const failureCode = safeSmsFailureCode(error);
    await db.$transaction(async (tx) => {
      await tx.facilitiesCorrectionRequest.update({
        where: { id: claimed.id },
        data: { smsStatus: FacilitiesCorrectionSmsStatus.FAILED, smsSentAt: null, smsFailureCode: failureCode },
      });
      await tx.facilitiesAuditLog.create({
        data: {
          applicationId: claimed.applicationId,
          actorType: AuditActorType.SYSTEM,
          actorId: "system",
          action: FacilitiesAuditAction.CORRECTION_SMS_FAILED,
          outcome: AuditOutcome.FAILED,
          entityType: "FacilitiesCorrectionRequest",
          entityId: claimed.id,
          metadata: { correctionRequestId: claimed.id, reasonCode: failureCode },
        },
      });
    });
    logger.error("facilities_correction_sms_failed", error, {
      applicationId: claimed.applicationId,
      correctionRequestId: claimed.id,
      mobile: maskMobile(claimed.mobile),
      reasonCode: failureCode,
    });
    return { sent: false as const };
  }
}

export async function getFacilitiesReviewOverview() {
  await requireFacilitiesAdmin();
  const [total, submitted, underReview, needsEdit, validationCompleted] = await Promise.all([
    db.facilitiesApplication.count({ where: { status: { in: FACILITIES_REVIEW_VISIBLE_STATUSES } } }),
    db.facilitiesApplication.count({ where: { status: ApplicationStatus.SUBMITTED } }),
    db.facilitiesApplication.count({ where: { status: ApplicationStatus.UNDER_REVIEW } }),
    db.facilitiesApplication.count({ where: { status: ApplicationStatus.NEEDS_EDIT } }),
    db.facilitiesApplication.count({ where: { status: ApplicationStatus.VALIDATION_COMPLETED } }),
  ]);
  return { total, submitted, underReview, needsEdit, validationCompleted };
}

export async function listFacilitiesReviews(input?: { q?: string; status?: string }) {
  await requireFacilitiesAdmin();
  const q = input?.q?.trim();
  const status = FACILITIES_REVIEW_VISIBLE_STATUSES.includes(input?.status as ApplicationStatus)
    ? input?.status as ApplicationStatus
    : undefined;
  return db.facilitiesApplication.findMany({
    where: {
      status: status ?? { in: FACILITIES_REVIEW_VISIBLE_STATUSES },
      ...(q ? {
        OR: [
          { user: { mobile: { contains: q } } },
          { companySnapshot: { is: { name: { contains: q } } } },
          { companySnapshot: { is: { nationalId: { contains: q } } } },
        ],
      } : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, status: true, facilityType: true, requestedAmountRial: true, submittedAt: true, updatedAt: true,
      user: { select: { mobile: true } },
      companySnapshot: { select: { name: true, nationalId: true } },
      intake: { select: { name: true } },
      intakeSupplier: { select: { supplier: { select: { name: true } } } },
      correctionRequests: { where: { resolvedAt: null }, select: { smsStatus: true }, take: 1 },
    },
  });
}

export async function getFacilitiesReview(applicationId: string) {
  const { permissions } = await getFacilitiesAdminAccess();
  const application = await db.facilitiesApplication.findFirst({
    where: { id: applicationId, status: { in: FACILITIES_REVIEW_VISIBLE_STATUSES } },
    include: {
      user: { select: { mobile: true } },
      companySnapshot: true,
      shareholders: { orderBy: { createdAt: "asc" } },
      officers: { orderBy: { createdAt: "asc" } },
      intake: { select: { name: true } },
      intakeSupplier: { include: { supplier: { select: { name: true } } } },
      questionnaireTemplateVersion: { select: { id: true, versionLabel: true } },
      payments: { orderBy: { createdAt: "desc" }, select: { id: true, amountToman: true, gateway: true, referenceId: true, status: true, createdAt: true } },
      correctionRequests: { orderBy: { sequence: "desc" }, include: { reviewer: { select: { name: true } } } },
      history: { orderBy: { createdAt: "desc" } },
      fileBindings: {
        where: { scope: "APPLICATION" },
        select: { id: true, slotKey: true, currentUpload: { select: { lifecycleStatus: true, storedFile: { select: safeFileSelect } } } },
      },
      company: {
        select: {
          facilitiesFileBindings: {
            where: { scope: "COMPANY_PROFILE" },
            select: { id: true, slotKey: true, currentUpload: { select: { lifecycleStatus: true, storedFile: { select: safeFileSelect } } } },
          },
        },
      },
      evidence: true,
    },
  });
  return application ? {
    application,
    permissions: {
      canDownload: permissions.downloadFacilitiesFiles,
      canMutate: permissions.changeFacilitiesStatus,
    },
  } : null;
}

export async function startFacilitiesReview(applicationId: string) {
  const admin = await requireFacilitiesAdmin("changeFacilitiesStatus");
  await db.$transaction(async (tx) => {
    const application = await lockReviewApplication(tx, applicationId);
    if (application.status === ApplicationStatus.UNDER_REVIEW) return;
    if (application.status !== ApplicationStatus.SUBMITTED) throw new ActionError("این پرونده در صف شروع بررسی نیست", 409);
    await tx.facilitiesApplication.update({ where: { id: application.id }, data: { status: ApplicationStatus.UNDER_REVIEW } });
    await tx.facilitiesStatusHistory.create({ data: { applicationId, previousStatus: application.status, newStatus: ApplicationStatus.UNDER_REVIEW, actorType: AuditActorType.ADMIN, actorId: admin.id, note: "بررسی پرونده آغاز شد" } });
    await tx.facilitiesAuditLog.create({ data: { applicationId, actorType: AuditActorType.ADMIN, actorId: admin.id, action: FacilitiesAuditAction.STATUS_CHANGED, entityType: "FacilitiesApplication", entityId: applicationId, metadata: { previousStatus: application.status, newStatus: ApplicationStatus.UNDER_REVIEW } } });
  });
  refreshFacilitiesReviewPaths(applicationId);
}

export async function requestFacilitiesCorrection(input: { applicationId: string; note: string }) {
  const admin = await requireFacilitiesAdmin("changeFacilitiesStatus");
  const note = input.note.trim();
  if (!note || note.length > CORRECTION_NOTE_MAX || !PERSIAN_TEXT_PATTERN.test(note)) {
    throw new ActionError("متن اصلاح باید فارسی و بین ۱ تا ۲۰۰۰ نویسه باشد");
  }
  const result = await db.$transaction(async (tx) => {
    const application = await lockReviewApplication(tx, input.applicationId);
    if (application.status === ApplicationStatus.NEEDS_EDIT) {
      const open = await tx.facilitiesCorrectionRequest.findFirst({ where: { applicationId: application.id, resolvedAt: null } });
      if (open) return { correction: open, created: false };
    }
    if (application.status !== ApplicationStatus.UNDER_REVIEW) throw new ActionError("درخواست اصلاح فقط در زمان بررسی امکان‌پذیر است", 409);
    const latest = await tx.facilitiesCorrectionRequest.aggregate({ where: { applicationId: application.id }, _max: { sequence: true } });
    const correction = await tx.facilitiesCorrectionRequest.create({ data: { applicationId: application.id, sequence: (latest._max.sequence ?? 0) + 1, reviewerId: admin.id, note } });
    await tx.facilitiesApplication.update({ where: { id: application.id }, data: { status: ApplicationStatus.NEEDS_EDIT } });
    await tx.facilitiesStatusHistory.create({ data: { applicationId: application.id, previousStatus: application.status, newStatus: ApplicationStatus.NEEDS_EDIT, actorType: AuditActorType.ADMIN, actorId: admin.id, note } });
    await tx.facilitiesAuditLog.create({ data: { applicationId: application.id, actorType: AuditActorType.ADMIN, actorId: admin.id, action: FacilitiesAuditAction.CORRECTION_REQUESTED, entityType: "FacilitiesCorrectionRequest", entityId: correction.id, metadata: { correctionRequestId: correction.id, previousStatus: application.status, newStatus: ApplicationStatus.NEEDS_EDIT } } });
    return { correction, created: true };
  });
  const delivery = result.created ? await deliverCorrectionSms(result.correction.id) : { sent: result.correction.smsStatus === FacilitiesCorrectionSmsStatus.SENT };
  refreshFacilitiesReviewPaths(input.applicationId);
  return { correctionId: result.correction.id, smsSent: delivery.sent };
}

export async function completeFacilitiesValidation(input: { applicationId: string; note?: string }) {
  const admin = await requireFacilitiesAdmin("changeFacilitiesStatus");
  const note = input.note?.trim();
  if (note && note.length > CORRECTION_NOTE_MAX) throw new ActionError("یادداشت بیش از حد طولانی است");
  await db.$transaction(async (tx) => {
    const application = await lockReviewApplication(tx, input.applicationId);
    if (application.status === ApplicationStatus.VALIDATION_COMPLETED) return;
    if (application.status !== ApplicationStatus.UNDER_REVIEW) throw new ActionError("پایان بررسی فقط برای پرونده در حال بررسی مجاز است", 409);
    await tx.facilitiesApplication.update({ where: { id: application.id }, data: { status: ApplicationStatus.VALIDATION_COMPLETED } });
    await tx.facilitiesStatusHistory.create({ data: { applicationId: application.id, previousStatus: application.status, newStatus: ApplicationStatus.VALIDATION_COMPLETED, actorType: AuditActorType.ADMIN, actorId: admin.id, note: note || "فرآیند اعتبارسنجی پایان یافت" } });
    await tx.facilitiesAuditLog.create({ data: { applicationId: application.id, actorType: AuditActorType.ADMIN, actorId: admin.id, action: FacilitiesAuditAction.STATUS_CHANGED, entityType: "FacilitiesApplication", entityId: application.id, metadata: { previousStatus: application.status, newStatus: ApplicationStatus.VALIDATION_COMPLETED } } });
  });
  refreshFacilitiesReviewPaths(input.applicationId);
}

export async function retryFacilitiesCorrectionSms(correctionId: string) {
  await requireFacilitiesAdmin("changeFacilitiesStatus");
  const result = await deliverCorrectionSms(correctionId, true);
  const correction = await db.facilitiesCorrectionRequest.findUnique({ where: { id: correctionId }, select: { applicationId: true } });
  if (correction) refreshFacilitiesReviewPaths(correction.applicationId);
  return result;
}
