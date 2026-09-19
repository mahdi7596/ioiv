import { randomUUID } from "node:crypto";
import path from "node:path";
import { db } from "@/lib/db";
import { readPrivateDocument } from "@/lib/files/qualification";
import { ALLOWED_UPLOAD_EXTENSIONS, MAX_UPLOAD_SIZE_BYTES } from "@/lib/validations/shared";
import { type FacilitiesFileScanner } from "@/lib/facilities-files/scanner";
import { getUploadDir, verifyLegacyUploadContent } from "./storage";
import { lockLegacyApplication, LegacyFileConflict } from "./coordination";
import { legacyReferences } from "./slots";

/** Metadata inventory only: never scans, adopts ambiguous rows, or returns private paths. */
export async function inventoryLegacyVerification(afterId?: string, take = 100) {
  const files = await db.applicationFile.findMany({ where: afterId ? { id: { gt: afterId } } : {}, orderBy: { id: "asc" }, take: Math.min(Math.max(take, 1), 500), include: { currentBinding: true, verifications: { where: { verdict: { not: "UNAVAILABLE" } }, orderBy: { sequence: "desc" }, take: 1 } } });
  return files.map(file => ({ fileId: file.id, applicationId: file.applicationId, slot: file.fieldKey, bound: file.currentBinding !== null, verdict: file.verifications[0]?.verdict ?? file.scanVerdict ?? "UNKNOWN" }));
}

/** Explicit maintenance operation. Caller supplies approved scanner; no access/deletion changes. */
export async function verifyHistoricalLegacyFile(fileId: string, scanner: FacilitiesFileScanner) {
  const file = await db.applicationFile.findUniqueOrThrow({ where: { id: fileId }, include: { currentBinding: true } });
  const binding = file.currentBinding;
  if (!binding || binding.applicationId !== file.applicationId || binding.slotKey !== file.fieldKey) throw new LegacyFileConflict();
  let verdict: "PASSED" | "FAILED" | "UNAVAILABLE" | "MISSING" | "CORRUPT" = "MISSING";
  let verified: ReturnType<typeof verifyLegacyUploadContent> | undefined;
  try {
    const bytes = await readPrivateDocument(getUploadDir(), file.storagePath, file.size, MAX_UPLOAD_SIZE_BYTES);
    verdict = "CORRUPT";
    if (!(ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(path.extname(file.originalName).toLowerCase())) throw new Error("DOCUMENT_TYPE");
    verified = verifyLegacyUploadContent(file.originalName, bytes);
    // Scanner transport errors are observations, never evidence of malware or success.
    try { verdict = (await scanner.scan({ storageKey: `staging/${randomUUID()}`, bytes, byteSize: bytes.length, sha256: verified.sha256, fileType: verified.fileType })).status; }
    catch { verdict = "UNAVAILABLE"; }
  } catch { /* Preserve the non-sensitive classification, without paths/content. */ }

  return db.$transaction(async tx => {
    const application = await lockLegacyApplication(tx, file.applicationId);
    const current = await tx.legacyFileBinding.findUnique({ where: { id: binding.id } });
    if (current?.currentFileId !== file.id || current.generation !== binding.generation || legacyReferences(application).get(file.fieldKey)?.fileId !== file.id) throw new LegacyFileConflict();
    if (await tx.legacyFileDeletionIntent.findUnique({ where: { predecessorId: file.id } })) throw new LegacyFileConflict();
    if (verified) {
      // Bind evidence only to the bytes scanned, after excluding replacement races.
      const bytes = await readPrivateDocument(getUploadDir(), file.storagePath, file.size, MAX_UPLOAD_SIZE_BYTES);
      if (verifyLegacyUploadContent(file.originalName, bytes).sha256 !== verified.sha256) throw new LegacyFileConflict();
    }
    const previous = await tx.legacyFileVerification.findFirst({ where: { fileId }, orderBy: { sequence: "desc" } });
    if (previous?.verdict === verdict && previous.sha256 === (verified?.sha256 ?? null)) return { fileId, verdict, recorded: false };
    await tx.legacyFileVerification.create({ data: { fileId, verdict, sha256: verified?.sha256, mimeType: verified?.detectedMimeType, byteSize: verified ? file.size : undefined } });
    return { fileId, verdict, recorded: true };
  });
}
