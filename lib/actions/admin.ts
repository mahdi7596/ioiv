"use server";

import { ApplicationStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { currentLegacyFiles } from "@/lib/uploads/slots";
import { db } from "@/lib/db";
import { getAdminPermissions } from "@/lib/admin/permissions";
import { requireActiveAdmin } from "@/lib/admin/require-admin";
import { VALIDATION_CERTIFICATE_FIELD_KEY } from "@/lib/application/certificate";
import { getAllowedNextApplicationStatuses } from "@/lib/application/status-transitions";
import { logger, maskMobile } from "@/lib/logger";
import { sendSms } from "@/lib/sms";
import { createStatusChangeSmsMessage } from "@/lib/sms/messages";
import { stageLegacyUpload } from "@/lib/uploads/candidates";
import { cleanupLegacyReplacements } from "@/lib/uploads/replace";
import { commitLegacyFile, lockLegacyApplication, legacyTransactionOptions, LegacyFileConflict } from "@/lib/uploads/coordination";
import { assertReviewSnapshot, requireLockedReviewAdmin } from "@/lib/admin/review-guard";
import { ADMIN_PAGE_SIZE, decodeKeysetCursor, keysetWhere, sliceKeysetPage } from "@/lib/pagination";
import { ActionError } from "./auth";

export async function getCurrentAdminPermissions() {
  const admin = await requireActiveAdmin("viewAdminPanel");

  return getAdminPermissions(admin.role);
}

export async function getAdminOverview() {
  await requireActiveAdmin("viewAdminPanel");
  const [total, submitted, underReview, needsEdit, validationCompleted] = await Promise.all([
    db.application.count(),
    db.application.count({ where: { status: ApplicationStatus.SUBMITTED } }),
    db.application.count({ where: { status: ApplicationStatus.UNDER_REVIEW } }),
    db.application.count({ where: { status: ApplicationStatus.NEEDS_EDIT } }),
    db.application.count({ where: { status: ApplicationStatus.VALIDATION_COMPLETED } }),
  ]);

  return { total, submitted, underReview, needsEdit, validationCompleted };
}

export async function listSubmissions(input?: {
  q?: string;
  status?: string;
  sort?: string;
  cursor?: string;
}) {
  await requireActiveAdmin("viewEntries");
  const q = input?.q?.trim();
  const status = input?.status as ApplicationStatus | undefined;
  const direction = input?.sort === "oldest" ? "asc" : "desc";
  const cursor = decodeKeysetCursor(input?.cursor);

  const where: Prisma.ApplicationWhereInput = {
    ...(status && Object.values(ApplicationStatus).includes(status) ? { status } : {}),
    ...(q
      ? {
          OR: [
            { mobile: { contains: q } },
            { companyName: { contains: q } },
            { companyNationalId: { contains: q } },
            { companyContactFullName: { contains: q } },
            { companyContactNationalCode: { contains: q } },
            { nationalCode: { contains: q } },
          ],
        }
      : {}),
    ...(cursor ? { AND: [keysetWhere("createdAt", cursor, direction) as Prisma.ApplicationWhereInput] } : {}),
  };

  const found = await db.application.findMany({
    where,
    // The id tiebreaker keeps the keyset cursor stable when timestamps collide.
    orderBy: [{ createdAt: direction }, { id: direction }],
    take: ADMIN_PAGE_SIZE + 1,
    include: {
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return sliceKeysetPage(found, (row) => row.createdAt);
}

export async function getSubmission(id: string) {
  await requireActiveAdmin("viewEntries");

  const submission = await db.application.findUnique({
    where: { id },
    include: {
      legacyFileBindings: { include: { currentFile: true } },
      files: { orderBy: { createdAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" } },
      history: { orderBy: { createdAt: "desc" } },
      user: true,
    },
  });
  if (submission) submission.files = currentLegacyFiles(submission.files, submission.legacyFileBindings);
  return submission;
}

export async function changeSubmissionStatus(formData: FormData) {
  const admin = await requireActiveAdmin("changeSubmissionStatus");
  const applicationId = String(formData.get("applicationId") || "");
  const nextStatus = String(formData.get("status") || "") as ApplicationStatus;
  const note = String(formData.get("note") || "").trim();
  const certificate = formData.get("certificate");
  const application = await db.application.findUnique({ where: { id: applicationId } });

  if (!application || !Object.values(ApplicationStatus).includes(nextStatus)) {
    throw new ActionError("درخواست تغییر وضعیت معتبر نیست");
  }

  assertReviewSnapshot(formData, application);
  const allowed = getAllowedNextApplicationStatuses(application.status);

  if (!allowed.includes(nextStatus)) {
    throw new ActionError("این تغییر وضعیت مجاز نیست");
  }

  const certificateRecord =
    nextStatus === ApplicationStatus.VALIDATION_COMPLETED
      ? await storeValidationCertificate(application.id, certificate)
      : null;

  try {
    await db.$transaction(async tx => {
      const current = await lockLegacyApplication(tx, application.id);
      await requireLockedReviewAdmin(tx, admin.id, "changeSubmissionStatus");
      assertReviewSnapshot(formData, current);
      if (!getAllowedNextApplicationStatuses(current.status).includes(nextStatus)) throw new ActionError("این تغییر وضعیت مجاز نیست", 409);
      if (current.status !== application.status || current.updatedAt.getTime() !== application.updatedAt.getTime()) throw new LegacyFileConflict();
      await tx.application.update({ where: { id: current.id }, data: { status: nextStatus, draftVersion: { increment: 1 }, adminNote: note || current.adminNote } });
      if (certificateRecord) await commitLegacyFile(tx, { application: current, fieldKey: VALIDATION_CERTIFICATE_FIELD_KEY, stored: certificateRecord });
      await tx.statusHistory.create({ data: { applicationId: current.id, previousStatus: current.status, newStatus: nextStatus, changedById: admin.id, note: note || undefined } });
    }, legacyTransactionOptions);
  } catch (error) {
    // Journalled candidates are reconciled after retention; no request-path unlink.
    if (error instanceof LegacyFileConflict) {
      throw new ActionError(error.message, 409);
    }
    throw error;
  }
  if (certificateRecord) await cleanupLegacyReplacements(application.id, VALIDATION_CERTIFICATE_FIELD_KEY).catch(() => undefined);

  try {
    await sendSms(createStatusChangeSmsMessage(application.mobile));
  } catch (error) {
    logger.error("submission_status_sms_failed", error, {
      applicationId: application.id,
      newStatus: nextStatus,
      mobile: maskMobile(application.mobile),
    });
  }

  logger.info("submission_status_changed", {
    applicationId: application.id,
    previousStatus: application.status,
    newStatus: nextStatus,
    adminId: admin.id,
    mobile: maskMobile(application.mobile),
    hasNote: Boolean(note),
    hasCertificate: Boolean(certificateRecord),
  });

  revalidatePath("/admin");
  revalidatePath("/admin/submissions");
  revalidatePath(`/admin/submissions/${application.id}`);
  revalidatePath("/dashboard");
}

async function storeValidationCertificate(applicationId: string, file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) {
    throw new ActionError("برای پایان فرآیند اعتبارسنجی باید فایل PDF گواهی را بارگذاری کنید");
  }

  try {
    const stored = await stageLegacyUpload({
      applicationId,
      fieldKey: VALIDATION_CERTIFICATE_FIELD_KEY,
      file,
      pdfOnly: true,
    });

    return stored;
  } catch (error) {
    const message = error instanceof Error ? error.message : "بارگذاری گواهی ناموفق بود";
    throw new ActionError(message);
  }
}

export async function replaceValidationCertificate(formData: FormData) {
  const admin = await requireActiveAdmin("manageValidationCertificates");
  const applicationId = String(formData.get("applicationId") || "");
  const certificate = formData.get("certificate");
  const application = await db.application.findUnique({ where: { id: applicationId } });

  if (!application) {
    throw new ActionError("پرونده پیدا نشد", 404);
  }

  if (application.status !== ApplicationStatus.VALIDATION_COMPLETED) {
    throw new ActionError("تعویض گواهی فقط پس از پایان فرآیند اعتبارسنجی امکان‌پذیر است");
  }

  assertReviewSnapshot(formData, application);
  const certificateRecord = await storeValidationCertificate(application.id, certificate);

  try { await db.$transaction(async tx => {
    const current = await lockLegacyApplication(tx, application.id);
    await requireLockedReviewAdmin(tx, admin.id, "manageValidationCertificates");
    assertReviewSnapshot(formData, current);
    if (current.status !== ApplicationStatus.VALIDATION_COMPLETED || current.updatedAt.getTime() !== application.updatedAt.getTime()) throw new LegacyFileConflict();
    await commitLegacyFile(tx, { application: current, fieldKey: VALIDATION_CERTIFICATE_FIELD_KEY, stored: certificateRecord });
  }, legacyTransactionOptions);
  } catch (error) {
    if (error instanceof LegacyFileConflict) throw new ActionError(error.message, 409);
    throw error;
  }
  await cleanupLegacyReplacements(application.id, VALIDATION_CERTIFICATE_FIELD_KEY).catch(() => undefined);

  logger.info("validation_certificate_replaced", {
    applicationId: application.id,
    adminId: admin.id,
    mobile: maskMobile(application.mobile),
  });

  revalidatePath("/admin/submissions");
  revalidatePath(`/admin/submissions/${application.id}`);
  revalidatePath("/dashboard");
}
