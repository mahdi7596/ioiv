"use server";

import { Prisma, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { ActionError } from "@/lib/actions/auth";
import { FilesystemFacilitiesPrivateStorage } from "@/lib/facilities-files/storage";
import { createFacilitiesScannerFromEnv } from "@/lib/facilities-files/scanner";
import { stageVerifyScanPromoteFacilitiesFile } from "@/lib/facilities-files/lifecycle";

async function requireSuperAdmin() {
  const session = await requireSession("admin");
  const admin = await db.admin.findUnique({ where: { id: session.subjectId } });
  if (!admin?.active || admin.role !== UserRole.SUPER_ADMIN) throw new ActionError("فقط مدیر ارشد به تنظیمات تسهیلات دسترسی دارد", 403);
  return admin;
}

export async function getFacilitiesConfiguration() {
  await requireSuperAdmin();
  return db.facilitiesProgramConfiguration.findUnique({ where: { program: "FACILITIES" } }).then(async (programme) => ({
    programme,
    suppliers: await db.facilitySupplier.findMany({ orderBy: { name: "asc" }, include: { templates: { orderBy: { createdAt: "desc" } } } }),
    intakes: await db.facilityIntake.findMany({ orderBy: { createdAt: "desc" }, include: { supplierConfigurations: { include: { supplier: true, questionnaireTemplateVersion: true } } } }),
  }));
}

export async function saveFacilitiesProgrammeEnabled(isEnabled: boolean) {
  const admin = await requireSuperAdmin();
  await db.$transaction(async (tx) => {
    await tx.facilitiesProgramConfiguration.upsert({ where: { program: "FACILITIES" }, create: { program: "FACILITIES", isEnabled }, update: { isEnabled } });
    await tx.facilitiesAuditLog.create({ data: { actorType: "ADMIN", actorId: admin.id, action: "INTAKE_CONFIGURED", entityType: "FacilitiesProgramConfiguration", entityId: "FACILITIES", metadata: {} } });
  });
  revalidatePath("/admin/facilities"); revalidatePath("/dashboard");
}

export async function createFacilitiesIntake(input: { name: string; maximumAmountRial: string; paymentEnabled: boolean }) {
  const admin = await requireSuperAdmin();
  const name = input.name.trim(); const maximum = new Prisma.Decimal(input.maximumAmountRial);
  if (!name || !maximum.isPositive()) throw new ActionError("نام دوره و سقف مبلغ معتبر نیست");
  const intake = await db.$transaction(async (tx) => {
    const row = await tx.facilityIntake.create({ data: { name, maximumAmountRial: maximum, paymentEnabled: input.paymentEnabled } });
    await tx.facilitiesAuditLog.create({ data: { actorType: "ADMIN", actorId: admin.id, action: "INTAKE_CONFIGURED", entityType: "FacilityIntake", entityId: row.id, metadata: {} } }); return row;
  });
  revalidatePath("/admin/facilities"); return intake;
}

export async function updateFacilitiesIntake(input: { intakeId: string; isEnabled: boolean; maximumAmountRial: string; paymentEnabled: boolean }) {
  const admin = await requireSuperAdmin(); const maximum = new Prisma.Decimal(input.maximumAmountRial);
  if (!maximum.isPositive()) throw new ActionError("سقف مبلغ معتبر نیست");
  await db.$transaction(async (tx) => { const changed = await tx.facilityIntake.update({ where: { id: input.intakeId }, data: { isEnabled: input.isEnabled, maximumAmountRial: maximum, paymentEnabled: input.paymentEnabled } }); await tx.facilitiesAuditLog.create({ data: { actorType: "ADMIN", actorId: admin.id, action: "INTAKE_CONFIGURED", entityType: "FacilityIntake", entityId: changed.id, metadata: {} } }); });
  revalidatePath("/admin/facilities"); revalidatePath("/dashboard/facilities-application");
}

export async function configureIntakeSupplier(input: { intakeId: string; supplierId: string; isEnabled: boolean; templateId?: string }) {
  const admin = await requireSuperAdmin();
  const template = input.templateId ? await db.questionnaireTemplateVersion.findFirst({ where: { id: input.templateId, supplierId: input.supplierId, publishedAt: { not: null }, retiredAt: null, storedFile: { scanStatus: "PASSED", fileType: { in: ["DOC", "DOCX"] } } } }) : null;
  if (input.isEnabled && !template) throw new ActionError("برای فعال‌سازی تأمین‌کننده، نسخه Word بررسی‌شده پرسشنامه لازم است");
  await db.$transaction(async (tx) => { const row = await tx.facilityIntakeSupplier.upsert({ where: { intakeId_supplierId: { intakeId: input.intakeId, supplierId: input.supplierId } }, create: { intakeId: input.intakeId, supplierId: input.supplierId, isEnabled: input.isEnabled, questionnaireTemplateVersionId: template?.id }, update: { isEnabled: input.isEnabled, questionnaireTemplateVersionId: template?.id ?? null } }); await tx.facilitiesAuditLog.create({ data: { actorType: "ADMIN", actorId: admin.id, action: "SUPPLIER_CONFIGURED", entityType: "FacilityIntakeSupplier", entityId: row.id, metadata: {} } }); });
  revalidatePath("/admin/facilities"); revalidatePath("/dashboard/facilities-application");
}

export async function uploadQuestionnaireTemplate(input: { supplierId: string; versionLabel: string; file: File }) {
  const admin = await requireSuperAdmin(); if (!input.versionLabel.trim() || input.file.size === 0) throw new ActionError("نسخه و فایل پرسشنامه لازم است");
  const staged = await stageVerifyScanPromoteFacilitiesFile({ fileName: input.file.name, bytes: Buffer.from(await input.file.arrayBuffer()), storage: new FilesystemFacilitiesPrivateStorage(), scanner: createFacilitiesScannerFromEnv() });
  if (staged.scanStatus !== "PASSED" || !["DOC", "DOCX"].includes(staged.fileType)) throw new ActionError("پرسشنامه باید فایل Word سالم و با بررسی امنیتی موفق باشد");
  await db.$transaction(async (tx) => { const file = await tx.storedFile.create({ data: { storageKey: staged.storageKey, originalName: staged.originalName, fileType: staged.fileType, detectedMimeType: staged.detectedMimeType, byteSize: staged.byteSize, sha256: staged.sha256, scanStatus: "PASSED", scannedAt: new Date() } }); const template = await tx.questionnaireTemplateVersion.create({ data: { supplierId: input.supplierId, versionLabel: input.versionLabel.trim(), storedFileId: file.id, publishedAt: new Date() } }); await tx.facilitiesAuditLog.create({ data: { actorType: "ADMIN", actorId: admin.id, action: "QUESTIONNAIRE_TEMPLATE_CONFIGURED", entityType: "QuestionnaireTemplateVersion", entityId: template.id, metadata: {} } }); });
  revalidatePath("/admin/facilities");
}
