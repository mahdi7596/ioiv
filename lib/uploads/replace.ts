import path from "node:path";
import { lstat, realpath, unlink } from "node:fs/promises";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getUploadDir } from "./storage";
import { SAFE_PATH_ID_PATTERN } from "@/lib/validations/shared";
import { LEGACY_CANONICAL_SLOT } from "./slots";

/** Only generated, contained regular files are eligible; historical ambiguity is retained. */
export async function safeDeletionPath(storagePath: string, applicationId: string, slotKey: string) {
  if (!SAFE_PATH_ID_PATTERN.test(applicationId) || (!LEGACY_CANONICAL_SLOT.test(slotKey) && slotKey !== "validationCertificate")) return false;
  const root = await realpath(path.resolve(getUploadDir()));
  const canonicalRoot = root;
  const expectedDirectory = path.resolve(root, applicationId, slotKey);
  if (!expectedDirectory.startsWith(root + path.sep)) return false;
  if (path.dirname(storagePath) !== expectedDirectory || !/^[0-9a-f-]{36}\.[a-z0-9]+$/.test(path.basename(storagePath))) return false;
  try {
    if (await realpath(path.dirname(storagePath)) !== path.join(canonicalRoot, applicationId, slotKey)) return false;
    const stat = await lstat(storagePath);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}

/** Durable authorization precedes I/O. A timeout cannot make the predecessor attachable. */
export async function retryLegacyFileDeletion(id: string) {
  const intent = await db.legacyFileDeletionIntent.findUniqueOrThrow({ where: { id } });
  if (intent.status === "SUCCEEDED") return true;
  if (intent.status === "RETAINED") return false;
  try {
    if (!await safeDeletionPath(intent.storagePath, intent.applicationId, intent.slotKey)) {
      if (intent.status !== "AUTHORIZED") await db.legacyFileDeletionIntent.update({ where: { id }, data: { status: "RETAINED", lastError: "UNSAFE_HISTORICAL_PATH" } });
      return false;
    }
    // Historical byte aliases cannot be proven from raw paths alone. Preserve them
    // pending D4; only journaled post-migration predecessors are auto-deleted.
    const allocated = await db.legacyUploadCandidate.findFirst({ where: { fileId: intent.predecessorId, status: "COMMITTED", storagePath: intent.storagePath } });
    if (!allocated) {
      if (intent.status !== "AUTHORIZED") await db.legacyFileDeletionIntent.update({ where: { id }, data: { status: "RETAINED", lastError: "HISTORICAL_OBJECT_REQUIRES_REVIEW" } });
      return false;
    }
    // Trigger serializes by immutable object path and rechecks every saved/current/shared ref.
    await db.legacyFileDeletionIntent.update({ where: { id, status: { in: ["PENDING", "AUTHORIZED"] } }, data: { status: "AUTHORIZED", attempts: { increment: 1 }, lastError: null } });
    try { await unlink(intent.storagePath); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await db.legacyFileDeletionIntent.update({ where: { id, status: "AUTHORIZED" }, data: { status: "SUCCEEDED", completedAt: new Date() } });
    return true;
  } catch {
    const completed = await db.legacyFileDeletionIntent.findUnique({ where: { id }, select: { status: true } }).catch(() => null);
    if (completed?.status === "SUCCEEDED") return true;
    // Never turn a successful replacement into failure or reveal filesystem/provider details.
    await db.legacyFileDeletionIntent.updateMany({ where: { id, status: { in: ["PENDING", "AUTHORIZED"] } }, data: { lastError: "DELETION_RETRY_REQUIRED" } }).catch(() => undefined);
    logger.warn("legacy_file_deletion_retry_required", { intentId: id });
    return false;
  }
}
export async function cleanupLegacyReplacements(applicationId: string, fieldKey: string) {
  const intents = await db.legacyFileDeletionIntent.findMany({ where: { applicationId, slotKey: fieldKey, status: { in: ["PENDING", "AUTHORIZED"] } }, orderBy: { createdAt: "asc" }, take: 100 });
  for (const intent of intents) await retryLegacyFileDeletion(intent.id);
}
