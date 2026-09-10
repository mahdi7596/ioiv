"use server";

import { AuditActorType, AuditOutcome, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, requireSession } from "@/lib/auth/session";
import { ActionError } from "@/lib/actions/auth";
import { intakeSchema, intakeSupplierSchema, programmeConfigurationSchema } from "@/lib/validations/facilities-config";

export async function requireFacilitiesSuperAdmin() {
  const session = await requireSession("admin");
  const admin = await db.admin.findUnique({ where: { id: session.subjectId } });
  if (!admin?.active || admin.role !== "SUPER_ADMIN") throw new ActionError("دسترسی پیکربندی تسهیلات فقط برای مدیر ارشد فعال است", 403);
  return admin;
}

export async function canManageFacilitiesConfiguration() {
  const session = await getSession();
  if (!session || session.kind !== "admin") return false;
  const admin = await db.admin.findUnique({ where: { id: session.subjectId }, select: { active: true, role: true } });
  return Boolean(admin?.active && admin.role === "SUPER_ADMIN");
}

const audit = (adminId: string, action: "PROGRAMME_CONFIGURED" | "INTAKE_CONFIGURED" | "SUPPLIER_CONFIGURED" | "QUESTIONNAIRE_TEMPLATE_CONFIGURED", entityType: string, entityId: string, metadata: Prisma.InputJsonValue) => ({ actorType: AuditActorType.ADMIN, actorId: adminId, action, outcome: AuditOutcome.SUCCEEDED, entityType, entityId, metadata });

export async function getFacilitiesConfiguration() {
  await requireFacilitiesSuperAdmin();
  return db.facilitiesProgramConfiguration.findUnique({ where: { program: "FACILITIES" } }).then(async (programme) => ({
    programme,
    suppliers: await db.facilitySupplier.findMany({ orderBy: { createdAt: "asc" }, include: { templates: { orderBy: { createdAt: "desc" }, select: { id: true, versionLabel: true, publishedAt: true, storedFile: { select: { originalName: true } } } } } }),
    intakes: await db.facilityIntake.findMany({ orderBy: { createdAt: "desc" }, include: { supplierConfigurations: true } }),
  }));
}

export async function saveFacilitiesProgramme(input: unknown) {
  const admin = await requireFacilitiesSuperAdmin(); const parsed = programmeConfigurationSchema.safeParse(input);
  if (!parsed.success) throw new ActionError("تنظیم برنامه معتبر نیست");
  await db.$transaction(async (tx) => {
    const row = await tx.facilitiesProgramConfiguration.upsert({ where: { program: "FACILITIES" }, create: { program: "FACILITIES", isEnabled: parsed.data.isEnabled }, update: { isEnabled: parsed.data.isEnabled } });
    await tx.facilitiesAuditLog.create({ data: audit(admin.id, "PROGRAMME_CONFIGURED", "FacilitiesProgramConfiguration", row.program, { changedFields: ["isEnabled"] }) });
  }); revalidatePath("/admin/facilities");
}

export async function saveFacilityIntake(input: unknown) {
  const admin = await requireFacilitiesSuperAdmin(); const parsed = intakeSchema.safeParse(input);
  if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message || "تنظیمات فراخوان معتبر نیست");
  const value = parsed.data;
  try { await db.$transaction(async (tx) => {
    const data = { name: value.name, isEnabled: value.isEnabled, maximumAmountRial: new Prisma.Decimal(value.maximumAmountRial), paymentEnabled: value.paymentEnabled, paymentAmountToman: Number(value.paymentAmountToman), paymentTermsVersion: null, paymentTermsText: null };
    const row = value.id ? await tx.facilityIntake.update({ where: { id: value.id }, data }) : await tx.facilityIntake.create({ data });
    await tx.facilitiesAuditLog.create({ data: audit(admin.id, "INTAKE_CONFIGURED", "FacilityIntake", row.id, { intakeId: row.id, changedFields: ["isEnabled", "maximumAmountRial", "paymentEnabled", "paymentAmountToman"] }) });
  }); } catch (error) { if ((error as { code?: string }).code === "P2002") throw new ActionError("نام فراخوان تکراری است"); throw error; }
  revalidatePath("/admin/facilities");
}

export async function saveFacilityIntakeSupplier(input: unknown) {
  const admin = await requireFacilitiesSuperAdmin(); const parsed = intakeSupplierSchema.safeParse(input);
  if (!parsed.success) throw new ActionError("تنظیم تأمین‌کننده معتبر نیست"); const value = parsed.data;
  await db.$transaction(async (tx) => {
    const template = value.questionnaireTemplateVersionId ? await tx.questionnaireTemplateVersion.findFirst({ where: { id: value.questionnaireTemplateVersionId, supplierId: value.supplierId } }) : null;
    if (value.isEnabled && !template) throw new ActionError("برای فعال‌سازی تأمین‌کننده، نسخه پرسشنامه بررسی‌شده را انتخاب کنید");
    const row = await tx.facilityIntakeSupplier.upsert({ where: { intakeId_supplierId: { intakeId: value.intakeId, supplierId: value.supplierId } }, create: { intakeId: value.intakeId, supplierId: value.supplierId, isEnabled: value.isEnabled, questionnaireTemplateVersionId: template?.id }, update: { isEnabled: value.isEnabled, questionnaireTemplateVersionId: template?.id } });
    await tx.facilitiesAuditLog.create({ data: audit(admin.id, "SUPPLIER_CONFIGURED", "FacilityIntakeSupplier", row.id, { intakeId: value.intakeId, supplierId: value.supplierId, ...(template ? { templateVersionId: template.id } : {}), changedFields: ["isEnabled", "questionnaireTemplateVersionId"] }) });
  }); revalidatePath("/admin/facilities");
}
