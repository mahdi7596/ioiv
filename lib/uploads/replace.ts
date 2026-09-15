import { unlink } from "node:fs/promises";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * After a new file has been recorded for (applicationId, fieldKey), remove the
 * rows and disk objects it supersedes so re-uploads replace instead of
 * accumulate. Best effort: the new row already exists, so a failure here only
 * leaves an orphan (the pre-existing behaviour) and must never fail the upload.
 */
export async function removeSupersededUploads(input: { applicationId: string; fieldKey: string; keepStoragePath: string }) {
  try {
    const stale = await db.applicationFile.findMany({
      where: { applicationId: input.applicationId, fieldKey: input.fieldKey, storagePath: { not: input.keepStoragePath } },
      select: { id: true, storagePath: true },
    });
    if (!stale.length) return 0;

    await db.applicationFile.deleteMany({ where: { id: { in: stale.map((file) => file.id) } } });
    await Promise.all(stale.map((file) => unlink(file.storagePath).catch((error: unknown) => {
      logger.warn("upload_superseded_unlink_failed", { fileId: file.id, error: error instanceof Error ? error.message : String(error) });
    })));
    logger.info("upload_superseded_removed", { applicationId: input.applicationId, fieldKey: input.fieldKey, count: stale.length });
    return stale.length;
  } catch (error) {
    logger.error("upload_superseded_cleanup_failed", error, { applicationId: input.applicationId, fieldKey: input.fieldKey });
    return 0;
  }
}
