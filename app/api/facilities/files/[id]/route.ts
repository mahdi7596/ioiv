import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { FilesystemFacilitiesPrivateStorage } from "@/lib/facilities-files/storage";
import { bytesMatchStoredDigest } from "@/lib/facilities-files/service";
import { facilitiesContentDisposition } from "@/lib/facilities-files/verification";
import { AuditActorType, FacilitiesAuditAction } from "@prisma/client";
import { facilitiesRequestId, writeFacilitiesAudit } from "@/lib/audit/facilities";

/**
 * This route is deliberately facilities-only. It does not alter the legacy
 * `/api/files/[id]` behavior. M8 moved administrators to an application-scoped
 * route; this unscoped endpoint remains owner-only.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = facilitiesRequestId(request.headers.get("x-request-id"));
  const session = await getSession();
  if (!session || session.kind !== "user") return Response.json({ error: "File not found" }, { status: 404 });
  const { id } = await context.params;
  const upload = await db.facilitiesFileUpload.findFirst({
    where: {
      storedFileId: id,
      lifecycleStatus: "PASSED",
      binding: { userId: session.subjectId, scope: { in: ["APPLICATION", "COMPANY_PROFILE"] } },
    },
    include: { binding: true, storedFile: true },
  });

  // Prisma cannot express a field-to-field current-upload comparison here. Keep
  // the explicit check after owner-scoped lookup; never depend on identifier secrecy.
  if (!upload || upload.binding.currentUploadId !== upload.id || !upload.storedFile) {
    return Response.json({ error: "File not found" }, { status: 404 });
  }
  try {
    const bytes = await new FilesystemFacilitiesPrivateStorage().readReady(upload.storedFile.storageKey as `ready/${string}`);
    if (bytes.byteLength !== upload.storedFile.byteSize || !bytesMatchStoredDigest(bytes, upload.storedFile.sha256)) {
      logger.warn("facilities_file_download_integrity_failed", { uploadId: upload.id, fileId: upload.storedFile.id });
      return Response.json({ error: "File not found" }, { status: 404 });
    }
    await writeFacilitiesAudit(db, { actorType: AuditActorType.USER, actorId: session.subjectId, action: FacilitiesAuditAction.FILE_DOWNLOADED, entityType: "StoredFile", entityId: upload.storedFile.id, applicationId: upload.binding.applicationId, requestId });
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": upload.storedFile.detectedMimeType,
        "Content-Length": String(upload.storedFile.byteSize),
        "Content-Disposition": facilitiesContentDisposition(upload.storedFile.originalName),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "X-Request-Id": requestId,
      },
    });
  } catch {
    logger.warn("facilities_file_download_unavailable", { uploadId: upload.id, fileId: upload.storedFile.id });
    return Response.json({ error: "File not found" }, { status: 404 });
  }
}
