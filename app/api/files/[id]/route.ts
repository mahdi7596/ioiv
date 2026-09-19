import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { logger } from "@/lib/logger";

// Only types the verifier can produce are served as-is; rows written before
// content verification carry browser-declared types and fall back to a generic
// binary type so nothing is rendered inline as HTML or script.
const SERVABLE_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/zip",
]);

export async function GET(_request: Request, context: RouteContext<"/api/files/[id]">) {
  try {
    const { id } = await context.params;
    const session = await getSession();

    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const file = await db.applicationFile.findUnique({
      where: { id },
      include: {
        application: true,
      },
    });

    if (!file) {
      return Response.json({ error: "File not found" }, { status: 404 });
    }

    if (session.kind === "user" && file.application.userId !== session.subjectId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    if (session.kind === "admin") {
      const admin = await db.admin.findUnique({ where: { id: session.subjectId } });

      if (!admin?.active || !hasAdminPermission(admin.role, "downloadSubmissionFiles")) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const deletion = await db.legacyFileDeletionIntent.findUnique({ where: { predecessorId: file.id }, select: { status: true } });
    if (deletion?.status === "AUTHORIZED" || deletion?.status === "SUCCEEDED") return Response.json({ error: "File not found" }, { status: 404 });
    const bytes = await readFile(file.storagePath);
    const encodedName = encodeURIComponent(path.basename(file.originalName));
    logger.info("file_download_succeeded", {
      fileId: file.id,
      applicationId: file.applicationId,
      size: file.size,
    });

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": SERVABLE_CONTENT_TYPES.has(file.mimeType) ? file.mimeType : "application/octet-stream",
        "Content-Length": String(file.size),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return Response.json({ error: "File not found" }, { status: 404 });
    logger.error("file_download_failed", error);
    return Response.json({ error: "File download failed" }, { status: 500 });
  }
}
