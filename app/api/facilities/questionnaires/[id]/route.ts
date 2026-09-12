import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { FilesystemFacilitiesPrivateStorage } from "@/lib/facilities-files/storage";
import { facilitiesContentDisposition } from "@/lib/facilities-files/verification";
import { bytesMatchStoredDigest } from "@/lib/facilities-files/service";
import { AuditActorType, FacilitiesAuditAction } from "@prisma/client";
import { facilitiesRequestId, writeFacilitiesAudit } from "@/lib/audit/facilities";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = facilitiesRequestId(request.headers.get("x-request-id"));
  const session = await getSession(); if (!session || session.kind !== "user") return Response.json({ error: "یافت نشد" }, { status: 404 });
  const { id } = await context.params; const intakeSupplierId = new URL(request.url).searchParams.get("intakeSupplierId");
  const template = await db.questionnaireTemplateVersion.findFirst({ where: { id, publishedAt: { not: null }, storedFile: { scanStatus: "PASSED", fileType: { in: ["DOC", "DOCX"] } } }, include: { storedFile: true } });
  const programme = await db.facilitiesProgramConfiguration.findUnique({ where: { program: "FACILITIES" } }); const company = await db.company.findUnique({ where: { userId: session.subjectId } });
  const existingApplication = template && intakeSupplierId ? await db.facilitiesApplication.findFirst({ where: { userId: session.subjectId, questionnaireTemplateVersionId: template.id, intakeSupplierId }, select: { id: true } }) : null;
  const currentlyOffered = template && !template.retiredAt ? await db.facilityIntakeSupplier.findFirst({ where: { id: intakeSupplierId ?? "", questionnaireTemplateVersionId: template.id, isEnabled: true, intake: { isEnabled: true } }, select: { id: true } }) : null;
  if (!company?.profileCompletedAt || !template || (!existingApplication && (!programme?.isEnabled || !currentlyOffered))) return Response.json({ error: "یافت نشد" }, { status: 404 });
  try { const bytes = await new FilesystemFacilitiesPrivateStorage().readReady(template.storedFile.storageKey as `ready/${string}`); if (bytes.byteLength !== template.storedFile.byteSize || !bytesMatchStoredDigest(bytes, template.storedFile.sha256)) return Response.json({ error: "یافت نشد" }, { status: 404 }); await writeFacilitiesAudit(db, { actorType: AuditActorType.USER, actorId: session.subjectId, action: FacilitiesAuditAction.QUESTIONNAIRE_DOWNLOADED, entityType: "QuestionnaireTemplateVersion", entityId: template.id, applicationId: existingApplication?.id ?? null, requestId }); return new Response(new Uint8Array(bytes), { headers: { "Content-Type": template.storedFile.detectedMimeType, "Content-Disposition": facilitiesContentDisposition(template.storedFile.originalName), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "X-Request-Id": requestId } }); } catch { return Response.json({ error: "فایل موقتاً در دسترس نیست" }, { status: 503 }); }
}
