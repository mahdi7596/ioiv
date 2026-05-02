"use server";

import { ApplicationStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { getAllowedNextApplicationStatuses } from "@/lib/application/status-transitions";
import { validateStatusChangeConfirmation } from "@/lib/application/status-change-validation";
import { logger, maskMobile } from "@/lib/logger";
import { sendSms } from "@/lib/sms";
import { createStatusChangeSmsMessage } from "@/lib/sms/messages";
import { ActionError } from "./auth";

async function requireActiveAdmin() {
  const session = await requireSession("admin");
  const admin = await db.admin.findUnique({ where: { id: session.subjectId } });

  if (!admin?.active) {
    throw new ActionError("دسترسی مدیریت فعال نیست", 403);
  }

  return admin;
}

export async function getAdminOverview() {
  await requireActiveAdmin();
  const [total, submitted, underReview, needsEdit, accepted, rejected] = await Promise.all([
    db.application.count(),
    db.application.count({ where: { status: ApplicationStatus.SUBMITTED } }),
    db.application.count({ where: { status: ApplicationStatus.UNDER_REVIEW } }),
    db.application.count({ where: { status: ApplicationStatus.NEEDS_EDIT } }),
    db.application.count({ where: { status: ApplicationStatus.ACCEPTED } }),
    db.application.count({ where: { status: ApplicationStatus.REJECTED } }),
  ]);

  return { total, submitted, underReview, needsEdit, accepted, rejected };
}

export async function listSubmissions(input?: {
  q?: string;
  status?: string;
  sort?: string;
}) {
  await requireActiveAdmin();
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
  await requireActiveAdmin();

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
  const admin = await requireActiveAdmin();
  const applicationId = String(formData.get("applicationId") || "");
  const nextStatus = String(formData.get("status") || "") as ApplicationStatus;
  const note = String(formData.get("note") || "").trim();
  const rejectionCompanyNationalId = String(formData.get("rejectionCompanyNationalId") || "");
  const application = await db.application.findUnique({ where: { id: applicationId } });

  if (!application || !Object.values(ApplicationStatus).includes(nextStatus)) {
    throw new ActionError("درخواست تغییر وضعیت معتبر نیست");
  }

  const allowed = getAllowedNextApplicationStatuses(application.status);

  if (!allowed.includes(nextStatus)) {
    throw new ActionError("این تغییر وضعیت مجاز نیست");
  }

  const confirmation = validateStatusChangeConfirmation({
    nextStatus,
    companyNationalId: application.companyNationalId,
    rejectionCompanyNationalId,
  });

  if (!confirmation.valid) {
    throw new ActionError(confirmation.message);
  }

  await db.$transaction([
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
  ]);

  await sendSms(createStatusChangeSmsMessage(application.mobile));

  logger.info("submission_status_changed", {
    applicationId: application.id,
    previousStatus: application.status,
    newStatus: nextStatus,
    adminId: admin.id,
    mobile: maskMobile(application.mobile),
    hasNote: Boolean(note),
  });

  revalidatePath("/admin");
  revalidatePath("/admin/submissions");
  revalidatePath(`/admin/submissions/${application.id}`);
}
