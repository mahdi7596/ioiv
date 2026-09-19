import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { db } from "@/lib/db";
import { storeUploadFile } from "./storage";
import { safeDeletionPath } from "./replace";

/** Journal allocation before writing; losing/uncertain attempts remain recoverable. */
export async function stageLegacyUpload(input: Parameters<typeof storeUploadFile>[0]) {
  const candidateId = randomUUID();
  const stored = await storeUploadFile({ ...input, beforeWrite: async storagePath => {
    await db.legacyUploadCandidate.create({ data: { id: candidateId, applicationId: input.applicationId, slotKey: input.fieldKey, storagePath } });
  } });
  await db.legacyUploadCandidate.update({ where: { id: candidateId, status: "STAGING" }, data: { status: "READY" } });
  return { ...stored, candidateId };
}

/** Conservative 24h expiry; irreversible DB fence is committed before physical I/O. */
export async function reconcileLegacyCandidate(id: string) {
  const candidate = await db.legacyUploadCandidate.findUniqueOrThrow({ where: { id } });
  if (candidate.status === "COMMITTED") return false;
  try {
    if (candidate.status !== "ABANDONED") await db.legacyUploadCandidate.update({ where: { id, status: { in: ["STAGING", "READY"] } }, data: { status: "ABANDONED" } });
    if (!await safeDeletionPath(candidate.storagePath, candidate.applicationId, candidate.slotKey)) return false;
    try { await unlink(candidate.storagePath); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await db.legacyUploadCandidate.update({ where: { id, status: "ABANDONED" }, data: { deletedAt: new Date(), lastError: null } });
    return true;
  } catch {
    await db.legacyUploadCandidate.updateMany({ where: { id, status: "ABANDONED" }, data: { lastError: "CANDIDATE_RETRY_REQUIRED" } }).catch(() => undefined);
    return false;
  }
}
