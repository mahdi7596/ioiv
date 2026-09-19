"use server";

import { ApplicationStatus, AuditActorType, AuditOutcome, FacilitiesAuditAction, FacilitiesCorrectionSmsStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { ActionError } from "@/lib/actions/auth";
import { requireFacilitiesAdmin, getFacilitiesAdminAccess } from "@/lib/admin/facilities-access";
import { db } from "@/lib/db";
import { ADMIN_PAGE_SIZE, decodeKeysetCursor, keysetWhere, sliceKeysetPage } from "@/lib/pagination";
import { requireLockedReviewAdmin } from "@/lib/admin/review-guard";
import { LEGACY_FILE_CONFLICT } from "@/lib/uploads/coordination";
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

type ReviewToken = { expectedVersion: number; expectedStatus: string };
function assertFacilitiesReviewToken(application: { reviewVersion: number; status: string }, token: ReviewToken) {
  if (!Number.isSafeInteger(token.expectedVersion) || token.expectedVersion !== application.reviewVersion || token.expectedStatus !== application.status) throw new ActionError(LEGACY_FILE_CONFLICT, 409);
}

async function claimCorrectionSms(correctionId: string, requireFailed: boolean, adminId?: string) {
  return db.$transaction(async (tx) => {
    const initial = await tx.facilitiesCorrectionRequest.findUnique({ where: { id: correctionId }, select: { applicationId: true } });
    if (!initial) throw new ActionError("درخواست اصلاح پیدا نشد", 404);
    const application = await lockReviewApplication(tx, initial.applicationId);
    if (adminId) await requireLockedReviewAdmin(tx, adminId, "changeFacilitiesStatus");
    const correction = await tx.facilitiesCorrectionRequest.findUnique({
      where: { id: correctionId },
      include: { application: { include: { user: { select: { mobile: true } } } } },
    });
    if (!correction) throw new ActionError("درخواست اصلاح پیدا نشد", 404);
    if (application.status !== ApplicationStatus.NEEDS_EDIT || correction.resolvedAt) throw new ActionError("این درخواست اصلاح دیگر فعال نیست. صفحه را تازه‌سازی کنید.", 409);
    if (correction.smsStatus === FacilitiesCorrectionSmsStatus.SENT) return null;
    if (!requireFailed && correction.smsAttemptCount !== 0) throw new ActionError("نتیجه ارسال قبلی هنوز مشخص نیست؛ ارسال دوباره مجاز نیست.", 409);
    if (requireFailed && correction.smsFailureCode !== "PROVIDER_REJECTED") throw new ActionError("نتیجه ارسال قبلی قطعی نیست؛ برای بررسی با پشتیبانی تماس بگیرید.", 409);
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

async function deliverCorrectionSms(correctionId: string, requireFailed = false, adminId?: string) {
  const claimed = await claimCorrectionSms(correctionId, requireFailed, adminId);
  if (!claimed) return { sent: true as const };
  try {
    await sendSms(createFacilitiesCorrectionSmsMessage(claimed.mobile, claimed.id));
  } catch {
    // The adapter cannot prove non-delivery after transport failure. Preserve the
    // spent claim; no second send is authorized by an uncertain outcome.
    await db.facilitiesCorrectionRequest.updateMany({ where: { id: claimed.id, smsStatus: "PENDING" }, data: { smsFailureCode: "DELIVERY_UNCONFIRMED" } }).catch(() => undefined);
    logger.error("facilities_correction_sms_unconfirmed", undefined, { applicationId: claimed.applicationId, correctionRequestId: claimed.id, mobile: maskMobile(claimed.mobile), reasonCode: "DELIVERY_UNCONFIRMED" });
    return { sent: false as const };
  }
  try {
    await db.$transaction(async tx => {
      await tx.facilitiesCorrectionRequest.update({ where: { id: claimed.id }, data: { smsStatus: FacilitiesCorrectionSmsStatus.SENT, smsSentAt: new Date(), smsFailureCode: null } });
      await tx.facilitiesAuditLog.create({ data: { applicationId: claimed.applicationId, actorType: AuditActorType.SYSTEM, actorId: "system", action: FacilitiesAuditAction.CORRECTION_SMS_SENT, outcome: AuditOutcome.SUCCEEDED, entityType: "FacilitiesCorrectionRequest", entityId: claimed.id, metadata: { correctionRequestId: claimed.id } } });
    });
    return { sent: true as const };
  } catch {
    // A failed or lost acknowledgement cannot downgrade SENT to retryable FAILED.
    await db.facilitiesCorrectionRequest.updateMany({ where: { id: claimed.id, smsStatus: "PENDING" }, data: { smsFailureCode: "PERSISTENCE_UNCONFIRMED" } }).catch(() => undefined);
    logger.error("facilities_correction_sms_persistence_unconfirmed", undefined, { applicationId: claimed.applicationId, correctionRequestId: claimed.id, reasonCode: "PERSISTENCE_UNCONFIRMED" });
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

export async function listFacilitiesReviews(input?: { q?: string; status?: string; cursor?: string }) {
  await requireFacilitiesAdmin();
  const q = input?.q?.trim();
  const status = FACILITIES_REVIEW_VISIBLE_STATUSES.includes(input?.status as ApplicationStatus)
    ? input?.status as ApplicationStatus
    : undefined;
  const cursor = decodeKeysetCursor(input?.cursor);
  // Ordered by last activity on purpose (a review queue wants recently changed
  // cases first); a row edited mid-pagination may move between pages, which is
  // acceptable for a human paging a queue.
  const found = await db.facilitiesApplication.findMany({
    where: {
      status: status ?? { in: FACILITIES_REVIEW_VISIBLE_STATUSES },
      ...(q ? {
        OR: [
          { user: { mobile: { contains: q } } },
          { companySnapshot: { is: { name: { contains: q } } } },
          { companySnapshot: { is: { nationalId: { contains: q } } } },
        ],
      } : {}),
      ...(cursor ? { AND: [keysetWhere("updatedAt", cursor, "desc") as Prisma.FacilitiesApplicationWhereInput] } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: ADMIN_PAGE_SIZE + 1,
    select: {
      id: true, status: true, facilityType: true, requestedAmountRial: true, submittedAt: true, updatedAt: true,
      user: { select: { mobile: true } },
      companySnapshot: { select: { name: true, nationalId: true } },
      intake: { select: { name: true } },
      intakeSupplier: { select: { supplier: { select: { name: true } } } },
      correctionRequests: { where: { resolvedAt: null }, select: { smsStatus: true }, take: 1 },
    },
  });
  return sliceKeysetPage(found, (row) => row.updatedAt);
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

export async function startFacilitiesReview(applicationId: string, token: ReviewToken) {
  const admin = await requireFacilitiesAdmin("changeFacilitiesStatus");
  await db.$transaction(async (tx) => {
    const application = await lockReviewApplication(tx, applicationId);
    await requireLockedReviewAdmin(tx, admin.id, "changeFacilitiesStatus");
    assertFacilitiesReviewToken(application, token);
    if (application.status !== ApplicationStatus.SUBMITTED) throw new ActionError("این پرونده در صف شروع بررسی نیست", 409);
    await tx.facilitiesApplication.update({ where: { id: application.id }, data: { status: ApplicationStatus.UNDER_REVIEW } });
    await tx.facilitiesStatusHistory.create({ data: { applicationId, previousStatus: application.status, newStatus: ApplicationStatus.UNDER_REVIEW, actorType: AuditActorType.ADMIN, actorId: admin.id, note: "بررسی پرونده آغاز شد" } });
    await tx.facilitiesAuditLog.create({ data: { applicationId, actorType: AuditActorType.ADMIN, actorId: admin.id, action: FacilitiesAuditAction.STATUS_CHANGED, entityType: "FacilitiesApplication", entityId: applicationId, metadata: { previousStatus: application.status, newStatus: ApplicationStatus.UNDER_REVIEW } } });
  });
  refreshFacilitiesReviewPaths(applicationId);
}

export async function requestFacilitiesCorrection(input: { applicationId: string; note: string } & ReviewToken) {
  const admin = await requireFacilitiesAdmin("changeFacilitiesStatus");
  const note = input.note.trim();
  if (!note || note.length > CORRECTION_NOTE_MAX || !PERSIAN_TEXT_PATTERN.test(note)) {
    throw new ActionError("متن اصلاح باید فارسی و بین ۱ تا ۲۰۰۰ نویسه باشد");
  }
  const result = await db.$transaction(async (tx) => {
    const application = await lockReviewApplication(tx, input.applicationId);
    await requireLockedReviewAdmin(tx, admin.id, "changeFacilitiesStatus");
    assertFacilitiesReviewToken(application, input);
    if (application.status !== ApplicationStatus.UNDER_REVIEW) throw new ActionError("درخواست اصلاح فقط در زمان بررسی امکان‌پذیر است", 409);
    const latest = await tx.facilitiesCorrectionRequest.aggregate({ where: { applicationId: application.id }, _max: { sequence: true } });
    const correction = await tx.facilitiesCorrectionRequest.create({ data: { applicationId: application.id, sequence: (latest._max.sequence ?? 0) + 1, reviewerId: admin.id, note } });
    await tx.facilitiesApplication.update({ where: { id: application.id }, data: { status: ApplicationStatus.NEEDS_EDIT } });
    await tx.facilitiesStatusHistory.create({ data: { applicationId: application.id, previousStatus: application.status, newStatus: ApplicationStatus.NEEDS_EDIT, actorType: AuditActorType.ADMIN, actorId: admin.id, note } });
    await tx.facilitiesAuditLog.create({ data: { applicationId: application.id, actorType: AuditActorType.ADMIN, actorId: admin.id, action: FacilitiesAuditAction.CORRECTION_REQUESTED, entityType: "FacilitiesCorrectionRequest", entityId: correction.id, metadata: { correctionRequestId: correction.id, previousStatus: application.status, newStatus: ApplicationStatus.NEEDS_EDIT } } });
    return { correction, created: true };
  });
  let delivery: { sent: boolean } = { sent: false };
  try { delivery = await deliverCorrectionSms(result.correction.id); }
  catch { logger.error("facilities_correction_sms_claim_unconfirmed", undefined, { correctionRequestId: result.correction.id, reasonCode: "CLAIM_UNCONFIRMED" }); }
  refreshFacilitiesReviewPaths(input.applicationId);
  return { correctionId: result.correction.id, smsSent: delivery.sent };
}

export async function completeFacilitiesValidation(input: { applicationId: string; note?: string } & ReviewToken) {
  const admin = await requireFacilitiesAdmin("changeFacilitiesStatus");
  const note = input.note?.trim();
  if (note && note.length > CORRECTION_NOTE_MAX) throw new ActionError("یادداشت بیش از حد طولانی است");
  await db.$transaction(async (tx) => {
    const application = await lockReviewApplication(tx, input.applicationId);
    await requireLockedReviewAdmin(tx, admin.id, "changeFacilitiesStatus");
    assertFacilitiesReviewToken(application, input);
    if (application.status !== ApplicationStatus.UNDER_REVIEW) throw new ActionError("پایان بررسی فقط برای پرونده در حال بررسی مجاز است", 409);
    await tx.facilitiesApplication.update({ where: { id: application.id }, data: { status: ApplicationStatus.VALIDATION_COMPLETED } });
    await tx.facilitiesStatusHistory.create({ data: { applicationId: application.id, previousStatus: application.status, newStatus: ApplicationStatus.VALIDATION_COMPLETED, actorType: AuditActorType.ADMIN, actorId: admin.id, note: note || "فرآیند اعتبارسنجی پایان یافت" } });
    await tx.facilitiesAuditLog.create({ data: { applicationId: application.id, actorType: AuditActorType.ADMIN, actorId: admin.id, action: FacilitiesAuditAction.STATUS_CHANGED, entityType: "FacilitiesApplication", entityId: application.id, metadata: { previousStatus: application.status, newStatus: ApplicationStatus.VALIDATION_COMPLETED } } });
  });
  refreshFacilitiesReviewPaths(input.applicationId);
}

export async function retryFacilitiesCorrectionSms(correctionId: string) {
  const admin = await requireFacilitiesAdmin("changeFacilitiesStatus");
  const result = await deliverCorrectionSms(correctionId, true, admin.id);
  const correction = await db.facilitiesCorrectionRequest.findUnique({ where: { id: correctionId }, select: { applicationId: true } });
  if (correction) refreshFacilitiesReviewPaths(correction.applicationId);
  return result;
}


/** Serialize only approved errors: production Server Actions redact thrown exceptions. */
export async function performFacilitiesReview(input:
 | ({ operation: "start" | "correction" | "complete"; applicationId: string; note?: string } & ReviewToken)
 | { operation: "retrySms"; correctionId: string }) {
  try {
    if (input.operation === "retrySms") {
      const result = await retryFacilitiesCorrectionSms(input.correctionId);
      return { ok: true as const, smsSent: result.sent };
    }
    if (input.operation === "start") await startFacilitiesReview(input.applicationId, input);
    else if (input.operation === "correction") {
      const result = await requestFacilitiesCorrection({ ...input, note: input.note ?? "" });
      return { ok: true as const, smsSent: result.smsSent };
    } else if (input.operation === "complete") await completeFacilitiesValidation(input);
    else throw new ActionError("درخواست معتبر نیست");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof ActionError) return { ok: false as const, status: error.status, error: error.message };
    return { ok: false as const, status: 503, error: "ثبت نتیجه تأیید نشد. صفحه را تازه‌سازی کنید و وضعیت پرونده را بررسی کنید." };
  }
}
