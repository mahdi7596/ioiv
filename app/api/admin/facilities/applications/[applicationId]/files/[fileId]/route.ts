import { AuditActorType, FacilitiesAuditAction } from "@prisma/client";

import { hasAdminPermission } from "@/lib/admin/permissions";
import { facilitiesRequestId, writeFacilitiesAudit } from "@/lib/audit/facilities";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { bytesMatchStoredDigest } from "@/lib/facilities-files/service";
import { FilesystemFacilitiesPrivateStorage } from "@/lib/facilities-files/storage";
import { facilitiesContentDisposition } from "@/lib/facilities-files/verification";
import { FACILITIES_REVIEW_VISIBLE_STATUSES } from "@/lib/facilities/review-status";
import { logger } from "@/lib/logger";

const missing = () => Response.json({ error: "فایل یافت نشد" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: Request, context: { params: Promise<{ applicationId: string; fileId: string }> }) {
  const requestId = facilitiesRequestId(request.headers.get("x-request-id"));
  const session = await getSession();
  if (!session || session.kind !== "admin") return Response.json({ error: "ورود مدیر لازم است" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const admin = await db.admin.findUnique({ where: { id: session.subjectId }, select: { id: true, active: true, role: true } });
  if (!admin?.active || !hasAdminPermission(admin.role, "downloadFacilitiesFiles")) return missing();
  const { applicationId, fileId } = await context.params;
  const application = await db.facilitiesApplication.findFirst({ where: { id: applicationId, status: { in: FACILITIES_REVIEW_VISIBLE_STATUSES } }, select: { id: true, companyId: true } });
  if (!application) return missing();
  const upload = await db.facilitiesFileUpload.findFirst({ where: { storedFileId: fileId, lifecycleStatus: "PASSED", binding: { OR: [{ applicationId: application.id, scope: "APPLICATION" }, { companyId: application.companyId, scope: "COMPANY_PROFILE" }] } }, include: { binding: true, storedFile: true } });
  if (!upload?.storedFile || upload.binding.currentUploadId !== upload.id || upload.storedFile.scanStatus !== "PASSED") return missing();
  try {
    const bytes = await new FilesystemFacilitiesPrivateStorage().readReady(upload.storedFile.storageKey as `ready/${string}`);
    if (bytes.byteLength !== upload.storedFile.byteSize || !bytesMatchStoredDigest(bytes, upload.storedFile.sha256)) {
      logger.warn("facilities_admin_file_integrity_failed", { requestId, applicationId, uploadId: upload.id, fileId });
      return missing();
    }
    await writeFacilitiesAudit(db, { actorType: AuditActorType.ADMIN, actorId: admin.id, action: FacilitiesAuditAction.FILE_DOWNLOADED, entityType: "StoredFile", entityId: fileId, applicationId, requestId });
    logger.info("facilities_admin_file_downloaded", { requestId, applicationId, uploadId: upload.id, fileId, byteSize: bytes.byteLength });
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": upload.storedFile.detectedMimeType, "Content-Length": String(upload.storedFile.byteSize), "Content-Disposition": facilitiesContentDisposition(upload.storedFile.originalName), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "X-Request-Id": requestId } });
  } catch {
    logger.warn("facilities_admin_file_download_unavailable", { requestId, applicationId, uploadId: upload.id, fileId });
    return Response.json({ error: "فایل موقتاً در دسترس نیست" }, { status: 503, headers: { "Cache-Control": "private, no-store", "X-Request-Id": requestId } });
  }
}
