import { AuditActorType, AuditOutcome } from "@prisma/client";
import { db } from "@/lib/db";
import { ActionError } from "@/lib/actions/auth";
import { requireFacilitiesSuperAdmin } from "@/lib/actions/facilities-config";
import { templateLabelSchema } from "@/lib/validations/facilities-config";
import { createAdminQuestionnaireTemplateBinding, scheduleUnpublishedTemplateDeletion, storeOwnedFacilitiesFile } from "@/lib/facilities-files/service";
import { FilesystemFacilitiesPrivateStorage } from "@/lib/facilities-files/storage";
import { createFacilitiesScannerFromEnv } from "@/lib/facilities-files/scanner";

export async function POST(request: Request) {
  try {
    const admin = await requireFacilitiesSuperAdmin();
    const form = await request.formData();
    const supplierId = form.get("supplierId"), versionLabel = templateLabelSchema.safeParse(form.get("versionLabel")), idempotencyKey = form.get("idempotencyKey"), file = form.get("file");
    if (typeof supplierId !== "string" || !versionLabel.success || typeof idempotencyKey !== "string" || !(file instanceof File)) return Response.json({ error: "اطلاعات نسخه پرسشنامه معتبر نیست" }, { status: 400 });
    if (file.size === 0 || file.size > 25 * 1024 * 1024) return Response.json({ error: "حجم فایل معتبر نیست" }, { status: 400 });
    const supplier = await db.facilitySupplier.findUnique({ where: { id: supplierId } });
    if (!supplier) return Response.json({ error: "تأمین‌کننده معتبر نیست" }, { status: 404 });
    if (await db.questionnaireTemplateVersion.findUnique({ where: { supplierId_versionLabel: { supplierId, versionLabel: versionLabel.data } } })) return Response.json({ error: "این نسخه قبلاً ثبت شده است" }, { status: 409 });
    const binding = await createAdminQuestionnaireTemplateBinding({ adminId: admin.id, supplierId, slotKey: `questionnaire-template-${crypto.randomUUID()}` });
    const stored = await storeOwnedFacilitiesFile({ adminId: admin.id, bindingId: binding.id, idempotencyKey, fileName: file.name, bytes: Buffer.from(await file.arrayBuffer()), storage: new FilesystemFacilitiesPrivateStorage(), scanner: createFacilitiesScannerFromEnv() });
    if (stored.lifecycleStatus !== "PASSED" || !stored.fileId || !stored.uploadId) return Response.json({ lifecycleStatus: stored.lifecycleStatus, error: "فایل هنوز قابل انتشار نیست" }, { status: 422 });
    const storedFileId = stored.fileId;
    const uploadId = stored.uploadId;
    let template;
    try { template = await db.$transaction(async (tx) => {
      const upload = await tx.facilitiesFileUpload.findFirst({ where: { id: uploadId, bindingId: binding.id, lifecycleStatus: "PASSED", storedFileId, binding: { scope: "QUESTIONNAIRE_TEMPLATE", adminId: admin.id, currentUploadId: uploadId } } });
      if (!upload) throw new ActionError("فایل پرسشنامه قابل انتشار نیست", 409);
      const created = await tx.questionnaireTemplateVersion.create({ data: { supplierId, versionLabel: versionLabel.data, storedFileId, publishedAt: new Date() } });
      await tx.facilitiesAuditLog.create({ data: { actorType: AuditActorType.ADMIN, actorId: admin.id, action: "QUESTIONNAIRE_TEMPLATE_CONFIGURED", outcome: AuditOutcome.SUCCEEDED, entityType: "QuestionnaireTemplateVersion", entityId: created.id, metadata: { supplierId, templateVersionId: created.id, fileId: storedFileId, changedFields: ["publishedAt"] } } });
      return created;
    }); } catch (error) { await scheduleUnpublishedTemplateDeletion(uploadId).catch(() => undefined); throw error; }
    return Response.json({ id: template.id, lifecycleStatus: "PASSED" }, { status: 201 });
  } catch (error) {
    const status = error instanceof ActionError ? error.status : 400;
    return Response.json({ error: error instanceof Error ? error.message : "ثبت پرسشنامه ناموفق بود" }, { status });
  }
}
