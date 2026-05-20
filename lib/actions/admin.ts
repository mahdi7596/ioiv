"use server";

import { ApplicationStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import {
  getAdminPermissions,
  hasAdminPermission,
  type AdminPermission,
} from "@/lib/admin/permissions";
import { VALIDATION_CERTIFICATE_FIELD_KEY } from "@/lib/application/certificate";
import { getAllowedNextApplicationStatuses } from "@/lib/application/status-transitions";
import { logger, maskMobile } from "@/lib/logger";
import { sendSms } from "@/lib/sms";
import { createStatusChangeSmsMessage } from "@/lib/sms/messages";
import { storeUploadFile } from "@/lib/uploads/storage";
import { ActionError } from "./auth";

async function requireActiveAdmin(permission: AdminPermission = "viewAdminPanel") {
  const session = await requireSession("admin");
  const admin = await db.admin.findUnique({ where: { id: session.subjectId } });

  if (!admin?.active) {
    throw new ActionError("دسترسی مدیریت فعال نیست", 403);
  }

  if (!hasAdminPermission(admin.role, permission)) {
    throw new ActionError("برای این عملیات دسترسی لازم را ندارید", 403);
  }

  return admin;
}

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
}) {
  await requireActiveAdmin("viewEntries");
  const q = input?.q?.trim();
  const status = input?.status as ApplicationStatus | undefined;

  return db.application.findMany({
    where: {
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
    },
    orderBy: { createdAt: input?.sort === "oldest" ? "asc" : "desc" },
    include: {
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

export async function getSubmission(id: string) {
  await requireActiveAdmin("viewEntries");

  return db.application.findUnique({
    where: { id },
    include: {
      files: { orderBy: { createdAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" } },
      history: { orderBy: { createdAt: "desc" } },
      user: true,
    },
  });
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

  const allowed = getAllowedNextApplicationStatuses(application.status);

  if (!allowed.includes(nextStatus)) {
    throw new ActionError("این تغییر وضعیت مجاز نیست");
  }

  const certificateRecord =
    nextStatus === ApplicationStatus.VALIDATION_COMPLETED
      ? await storeValidationCertificate(application.id, certificate)
      : null;

  const operations: Prisma.PrismaPromise<unknown>[] = [
    db.application.update({
      where: { id: application.id },
      data: {
        status: nextStatus,
        adminNote: note || application.adminNote,
      },
    }),
    db.statusHistory.create({
      data: {
        applicationId: application.id,
        previousStatus: application.status,
        newStatus: nextStatus,
        changedById: admin.id,
        note: note || undefined,
      },
    }),
  ];

  if (certificateRecord) {
    operations.push(
      db.applicationFile.create({
        data: certificateRecord,
      }),
    );
  }

  await db.$transaction(operations);

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
    const stored = await storeUploadFile({
      applicationId,
      fieldKey: VALIDATION_CERTIFICATE_FIELD_KEY,
      file,
      pdfOnly: true,
    });

    return {
      applicationId,
      fieldKey: VALIDATION_CERTIFICATE_FIELD_KEY,
      originalName: stored.originalName,
      mimeType: stored.mimeType,
      size: stored.size,
      storagePath: stored.storagePath,
    };
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

  const certificateRecord = await storeValidationCertificate(application.id, certificate);

  await db.applicationFile.create({
    data: certificateRecord,
  });

  logger.info("validation_certificate_replaced", {
    applicationId: application.id,
    adminId: admin.id,
    mobile: maskMobile(application.mobile),
  });

  revalidatePath("/admin/submissions");
  revalidatePath(`/admin/submissions/${application.id}`);
  revalidatePath("/dashboard");
}
