import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { FilesystemFacilitiesPrivateStorage } from "@/lib/facilities-files/storage";
import { bytesMatchStoredDigest } from "@/lib/facilities-files/service";
import { facilitiesContentDisposition } from "@/lib/facilities-files/verification";

/**
 * This route is deliberately facilities-only. It does not alter the legacy
 * `/api/files/[id]` behavior and grants no facility-admin access until the
 * product owner confirms the M7 reviewer permission matrix.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.kind !== "user") return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const upload = await db.facilitiesFileUpload.findFirst({
    where: {
      storedFileId: id,
      lifecycleStatus: "PASSED",
      binding: { userId: session.subjectId },
    },
    include: { binding: true, storedFile: true },
  });

  // Prisma cannot express a field-to-field current-upload comparison here. Keep
  // the explicit check after owner-scoped lookup; never depend on identifier secrecy.
  if (!upload || upload.binding.currentUploadId !== upload.id || !upload.storedFile) {
    return Response.json({ error: "File not found" }, { status: 404 });
  }
  // M3 company-profile evidence is intentionally reachable by its owner while
  // the application programme remains disabled. Application evidence retains
  // the programme availability gate.
  if (upload.binding.scope === "APPLICATION") {
    const programme = await db.facilitiesProgramConfiguration.findUnique({ where: { program: "FACILITIES" } });
    if (!programme?.isEnabled) return Response.json({ error: "File not found" }, { status: 404 });
  }

  try {
    const bytes = await new FilesystemFacilitiesPrivateStorage().readReady(upload.storedFile.storageKey as `ready/${string}`);
    if (bytes.byteLength !== upload.storedFile.byteSize || !bytesMatchStoredDigest(bytes, upload.storedFile.sha256)) {
      logger.warn("facilities_file_download_integrity_failed", { uploadId: upload.id, fileId: upload.storedFile.id });
      return Response.json({ error: "File not found" }, { status: 404 });
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": upload.storedFile.detectedMimeType,
        "Content-Length": String(upload.storedFile.byteSize),
        "Content-Disposition": facilitiesContentDisposition(upload.storedFile.originalName),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    logger.warn("facilities_file_download_unavailable", { uploadId: upload.id, fileId: upload.storedFile.id });
    return Response.json({ error: "File not found" }, { status: 404 });
  }
}
