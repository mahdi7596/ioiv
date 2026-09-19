"use server";

import { db } from "@/lib/db";
import { assertLegacyEditable, LegacyFileConflict, legacyDraftData, legacyTransactionOptions, lockLegacyApplication, validateLegacyDraft } from "@/lib/uploads/coordination";
import { requireSession } from "@/lib/auth/session";
import { VALIDATION_CERTIFICATE_FIELD_KEY } from "@/lib/application/certificate";
import { canEditApplication } from "@/lib/application/status";
import { applicationDraftSchema } from "@/lib/validations/application";
import { APPLICATION_ROUND } from "@/lib/validations/shared";
import { ActionError } from "./auth";

export async function getCurrentUserApplication() {
  const session = await requireSession("user");

  const user = await db.user.findUnique({
    where: { id: session.subjectId },
    include: {
      applications: {
        where: { applicationRound: APPLICATION_ROUND },
        orderBy: { createdAt: "desc" },
        include: {
          payments: { orderBy: { createdAt: "desc" }, take: 1 },
          legacyFileBindings: { where: { slotKey: VALIDATION_CERTIFICATE_FIELD_KEY }, include: { currentFile: true } },
          files: {
            where: { fieldKey: VALIDATION_CERTIFICATE_FIELD_KEY },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!user) {
    throw new ActionError("کاربر پیدا نشد", 404);
  }

  for (const application of user.applications) {
    const certificate = application.legacyFileBindings[0]?.currentFile;
    if (certificate) application.files = [certificate];
  }

  return {
    user,
    application: user.applications[0] ?? null,
  };
}

export async function createOrGetDraftApplication() {
  const session = await requireSession("user");

  const user = await db.user.findUnique({ where: { id: session.subjectId } });

  if (!user) {
    throw new ActionError("کاربر پیدا نشد", 404);
  }

  if (!user.companyNationalId) {
    throw new ActionError("شناسه ملی شرکت برای شروع پرونده الزامی است");
  }

  const existing = await db.application.findUnique({
    where: {
      mobile_companyNationalId_applicationRound: {
        mobile: user.mobile,
        companyNationalId: user.companyNationalId,
        applicationRound: APPLICATION_ROUND,
      },
    },
    include: {
      paymentObligation: { select: { state: true } },
      payments: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (existing) {
    return existing;
  }

  return db.application.create({
    data: {
      userId: user.id,
      mobile: user.mobile,
      companyName: user.companyName,
      companyNationalId: user.companyNationalId,
      companyContactFullName: user.companyContactFullName,
      companyContactNationalCode: user.companyContactNationalCode,
      nationalCode: user.nationalCode,
      applicationRound: APPLICATION_ROUND,
    },
    include: {
      paymentObligation: { select: { state: true } },
      payments: {
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function saveApplicationDraft(input: unknown) {
  const session = await requireSession("user");
  const parsed = applicationDraftSchema.safeParse(input);

  if (!parsed.success) {
    throw new ActionError(parsed.error.issues[0]?.message || "اطلاعات فرم معتبر نیست");
  }

  const application = await createOrGetDraftApplication();

  if (application.userId !== session.subjectId || !canEditApplication(application.status)) {
    throw new ActionError("امکان ویرایش این پرونده وجود ندارد", 403);
  }

  const data = parsed.data;

  try {
  const saved = await db.$transaction(async tx => {
    const current = await lockLegacyApplication(tx, application.id);
    await assertLegacyEditable(tx, current, session.subjectId);
    await validateLegacyDraft(tx, current, data, data.draftVersion);
    return tx.application.update({ where: { id: current.id }, data: { ...legacyDraftData(data), draftVersion: { increment: 1 } } });
  }, legacyTransactionOptions);
  return { ok: true as const, draftVersion: saved.draftVersion };
  } catch (error) {
    if (error instanceof LegacyFileConflict) return { ok: false as const, error: error.message };
    throw error;
  }
}
