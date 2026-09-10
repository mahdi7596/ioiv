import { createHash } from "node:crypto";

import {
  AuditActorType,
  AuditOutcome,
  FacilitiesFileBindingScope,
  FacilitiesFileFailureReason,
  FacilitiesFileLifecycleStatus,
  StoredFileScanStatus,
  StoredFileType,
} from "@prisma/client";

import { db } from "@/lib/db";
import { FacilitiesFileError } from "@/lib/facilities-files/errors";
import { stageVerifyScanPromoteFacilitiesFile } from "@/lib/facilities-files/lifecycle";
import type { FacilitiesFileScanner } from "@/lib/facilities-files/scanner";
import type { FacilitiesPrivateStorage, FacilitiesStorageKey } from "@/lib/facilities-files/storage";
import { verifyFacilitiesUpload } from "@/lib/facilities-files/verification";

export type FacilitiesFileCommitResult = {
  attemptId: string;
  uploadId?: string;
  fileId?: string;
  lifecycleStatus: FacilitiesFileLifecycleStatus;
  idempotent: boolean;
};

function ensureIdempotencyKey(key: string) {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) {
    throw new FacilitiesFileError("UNSUPPORTED_FILENAME");
  }
}

function failureFromError(error: unknown): { status: FacilitiesFileLifecycleStatus; reason: FacilitiesFileFailureReason } {
  if (error instanceof FacilitiesFileError) {
    switch (error.code) {
      case "FILE_TOO_LARGE":
        return { status: "OVERSIZED", reason: "FILE_TOO_LARGE" };
      case "UNSUPPORTED_FILENAME":
        return { status: "DISALLOWED", reason: "DISALLOWED_TYPE" };
      case "CONTENT_TYPE_MISMATCH":
        return { status: "DISALLOWED", reason: "CONTENT_TYPE_MISMATCH" };
      case "CONTENT_CORRUPT":
      case "ZIP_UNSAFE":
        return { status: "CORRUPT", reason: "CONTENT_CORRUPT" };
      default:
        return { status: "FAILED", reason: "STORAGE_WRITE_FAILED" };
    }
  }
  return { status: "FAILED", reason: "STORAGE_WRITE_FAILED" };
}

async function requireOwnedBinding(owner: { userId?: string; adminId?: string }, bindingId: string) {
  if ((owner.userId ? 1 : 0) + (owner.adminId ? 1 : 0) !== 1) throw new Error("FACILITIES_FILE_FORBIDDEN");
  const binding = await db.facilitiesFileBinding.findFirst({
    where: { id: bindingId, ...(owner.userId ? { userId: owner.userId } : { adminId: owner.adminId }) },
    include: { currentUpload: true },
  });
  if (!binding) throw new Error("FACILITIES_FILE_FORBIDDEN");
  return binding;
}

/**
 * M3/M5 call this server-side helper only after creating an owned Company or
 * FacilitiesApplication. M2 intentionally exposes no unaffiliated upload route.
 */
export async function createOwnedFacilitiesFileBinding(input: {
  userId: string;
  companyId: string;
  applicationId?: string;
  slotKey: string;
}) {
  const scope = input.applicationId ? FacilitiesFileBindingScope.APPLICATION : FacilitiesFileBindingScope.COMPANY_PROFILE;
  const company = await db.company.findFirst({ where: { id: input.companyId, userId: input.userId } });
  if (!company) throw new Error("FACILITIES_FILE_FORBIDDEN");
  if (input.applicationId) {
    const application = await db.facilitiesApplication.findFirst({
      where: { id: input.applicationId, userId: input.userId, companyId: input.companyId },
    });
    if (!application) throw new Error("FACILITIES_FILE_FORBIDDEN");
  }
  return db.facilitiesFileBinding.create({
    data: {
      scope,
      scopeId: input.applicationId ?? input.companyId,
      userId: input.userId,
      companyId: input.companyId,
      applicationId: input.applicationId,
      slotKey: input.slotKey,
    },
  });
}

/** A template is deliberately a fresh, admin-owned binding: it can never replace
 * an earlier template version and therefore cannot schedule that version for deletion. */
export async function createAdminQuestionnaireTemplateBinding(input: { adminId: string; supplierId: string; slotKey: string }) {
  const admin = await db.admin.findFirst({ where: { id: input.adminId, active: true, role: "SUPER_ADMIN" } });
  const supplier = await db.facilitySupplier.findUnique({ where: { id: input.supplierId } });
  if (!admin || !supplier || !/^[A-Za-z0-9_.-]{1,100}$/.test(input.slotKey)) throw new Error("FACILITIES_FILE_FORBIDDEN");
  return db.facilitiesFileBinding.create({
    data: { scope: "QUESTIONNAIRE_TEMPLATE", scopeId: input.supplierId, adminId: input.adminId, slotKey: input.slotKey },
  });
}

/** If publishing a freshly scanned template fails, retain a durable deletion
 * tombstone rather than an unreachable passed object. Published versions never
 * call this helper. */
export async function scheduleUnpublishedTemplateDeletion(uploadId: string) {
  return db.$transaction(async (tx) => {
    const upload = await tx.facilitiesFileUpload.findUnique({ where: { id: uploadId }, include: { binding: true } });
    if (!upload?.storedFileId || upload.binding.scope !== "QUESTIONNAIRE_TEMPLATE") return false;
    if (await tx.questionnaireTemplateVersion.count({ where: { storedFileId: upload.storedFileId } })) return false;
    await tx.facilitiesFileDeletionTombstone.upsert({ where: { uploadId }, create: { uploadId }, update: {} });
    return true;
  });
}

/**
 * Persist a replacement only after server-side type verification and a passed
 * malware scan. The database trigger serializes application quota reservations
 * and validates owner/scope/revision relationships.
 */
export async function storeOwnedFacilitiesFile(input: {
  userId?: string;
  adminId?: string;
  bindingId: string;
  idempotencyKey: string;
  fileName: string;
  bytes: Buffer | Uint8Array;
  storage: FacilitiesPrivateStorage;
  scanner: FacilitiesFileScanner;
}): Promise<FacilitiesFileCommitResult> {
  ensureIdempotencyKey(input.idempotencyKey);
  const bytes = Buffer.from(input.bytes);
  const binding = await requireOwnedBinding({ userId: input.userId, adminId: input.adminId }, input.bindingId);
  const existing = await db.facilitiesFileUploadAttempt.findUnique({
    where: { bindingId_idempotencyKey: { bindingId: binding.id, idempotencyKey: input.idempotencyKey } },
  });
  if (existing) {
    const upload = existing.uploadId ? await db.facilitiesFileUpload.findUnique({ where: { id: existing.uploadId } }) : null;
    return { attemptId: existing.id, uploadId: upload?.id, fileId: upload?.storedFileId ?? undefined, lifecycleStatus: existing.lifecycleStatus, idempotent: true };
  }

  let verified;
  try {
    verified = verifyFacilitiesUpload({ fileName: input.fileName, bytes });
  } catch (error) {
    const failure = failureFromError(error);
    const rejected = await db.facilitiesFileUploadAttempt.create({
      data: {
        bindingId: binding.id,
        idempotencyKey: input.idempotencyKey,
        lifecycleStatus: failure.status,
        failureReason: failure.reason,
      },
    });
    return { attemptId: rejected.id, lifecycleStatus: rejected.lifecycleStatus, idempotent: false };
  }

  let pending: { id: string };
  let attempt: { id: string };
  try {
    const created = await db.$transaction(async (tx) => {
      // Updating the binding obtains a row lock before revision allocation. This
      // serializes same-slot retries without relying on a client-side revision.
      await tx.facilitiesFileBinding.update({ where: { id: binding.id }, data: { updatedAt: new Date() } });
      const liveBinding = await tx.facilitiesFileBinding.findUniqueOrThrow({ where: { id: binding.id } });
      const latestRevision = await tx.facilitiesFileUpload.aggregate({ where: { bindingId: binding.id }, _max: { revisionNumber: true } });
      const createdAttempt = await tx.facilitiesFileUploadAttempt.create({
        data: { bindingId: binding.id, idempotencyKey: input.idempotencyKey, lifecycleStatus: FacilitiesFileLifecycleStatus.PENDING },
      });
      const createdUpload = await tx.facilitiesFileUpload.create({
        data: {
          bindingId: binding.id,
          idempotencyKey: input.idempotencyKey,
          revisionNumber: (latestRevision._max.revisionNumber ?? 0) + 1,
          replacesUploadId: liveBinding.currentUploadId ?? undefined,
          lifecycleStatus: FacilitiesFileLifecycleStatus.PENDING,
          reservedByteSize: verified.byteSize,
        },
      });
      await tx.facilitiesFileUploadAttempt.update({ where: { id: createdAttempt.id }, data: { uploadId: createdUpload.id } });
      return { attempt: createdAttempt, upload: createdUpload };
    });
    attempt = created.attempt;
    pending = created.upload;
  } catch (error) {
    const concurrentAttempt = await db.facilitiesFileUploadAttempt.findUnique({
      where: { bindingId_idempotencyKey: { bindingId: binding.id, idempotencyKey: input.idempotencyKey } },
    });
    if (concurrentAttempt) {
      const concurrentUpload = concurrentAttempt.uploadId
        ? await db.facilitiesFileUpload.findUnique({ where: { id: concurrentAttempt.uploadId } })
        : null;
      return { attemptId: concurrentAttempt.id, uploadId: concurrentUpload?.id, fileId: concurrentUpload?.storedFileId ?? undefined, lifecycleStatus: concurrentAttempt.lifecycleStatus, idempotent: true };
    }
    if (!(error instanceof Error) || !error.message.includes("quota exceeds 150 MiB")) {
      throw error;
    }
    // The trigger gives the only authoritative quota answer, including races.
    // The transaction rolled back, so this terminal attempt cannot poison a
    // revision number. A repeated key replays this safe outcome.
    const rejected = await db.facilitiesFileUploadAttempt.create({
      data: {
        bindingId: binding.id,
        idempotencyKey: input.idempotencyKey,
        lifecycleStatus: FacilitiesFileLifecycleStatus.OVERSIZED,
        failureReason: FacilitiesFileFailureReason.APPLICATION_QUOTA_EXCEEDED,
      },
    });
    return { attemptId: rejected.id, lifecycleStatus: rejected.lifecycleStatus, idempotent: false };
  }

  let staged;
  try {
    staged = await stageVerifyScanPromoteFacilitiesFile({
      fileName: input.fileName,
      bytes,
      storage: input.storage,
      scanner: input.scanner,
    });
  } catch (error) {
    const failure = failureFromError(error);
    const failed = await db.$transaction(async (tx) => {
      await tx.facilitiesFileUploadAttempt.update({ where: { id: attempt!.id }, data: { lifecycleStatus: failure.status, failureReason: failure.reason } });
      return tx.facilitiesFileUpload.update({ where: { id: pending.id }, data: { lifecycleStatus: failure.status, failureReason: failure.reason } });
    });
    return { attemptId: attempt!.id, uploadId: failed.id, lifecycleStatus: failed.lifecycleStatus, idempotent: false };
  }

  const storedFileScanStatus = staged.scanStatus === "PASSED" ? StoredFileScanStatus.PASSED : staged.scanStatus === "FAILED" ? StoredFileScanStatus.FAILED : StoredFileScanStatus.PENDING;
  let stored;
  try {
    stored = await db.storedFile.create({
      data: {
        storageKey: staged.storageKey,
        originalName: staged.originalName,
        fileType: StoredFileType[staged.fileType],
        detectedMimeType: staged.detectedMimeType,
        byteSize: staged.byteSize,
        sha256: staged.sha256,
        scanStatus: storedFileScanStatus,
        scannedAt: staged.scanStatus === "PASSED" || staged.scanStatus === "FAILED" ? new Date() : undefined,
      },
    });
  } catch (error) {
    // Best-effort immediate compensation; the aged opaque-key reaper covers a
    // process/storage failure that prevents this remove from completing.
    await input.storage.remove(staged.storageKey).catch(() => undefined);
    await db.$transaction(async (tx) => {
      await tx.facilitiesFileUpload.update({ where: { id: pending.id }, data: { lifecycleStatus: FacilitiesFileLifecycleStatus.INTERRUPTED, failureReason: FacilitiesFileFailureReason.UPLOAD_INTERRUPTED } });
      await tx.facilitiesFileUploadAttempt.update({ where: { id: attempt.id }, data: { lifecycleStatus: FacilitiesFileLifecycleStatus.INTERRUPTED, failureReason: FacilitiesFileFailureReason.UPLOAD_INTERRUPTED } });
    }).catch(() => undefined);
    throw error;
  }

  if (staged.scanStatus !== "PASSED") {
    const lifecycleStatus = staged.scanStatus === "UNAVAILABLE" ? FacilitiesFileLifecycleStatus.UNAVAILABLE : FacilitiesFileLifecycleStatus.FAILED;
    const failureReason = staged.scanStatus === "UNAVAILABLE" ? FacilitiesFileFailureReason.SCANNER_UNAVAILABLE : FacilitiesFileFailureReason.SCAN_FAILED;
    const unavailable = await db.$transaction(async (tx) => {
      await tx.facilitiesFileUploadAttempt.update({ where: { id: attempt!.id }, data: { lifecycleStatus, failureReason } });
      return tx.facilitiesFileUpload.update({ where: { id: pending.id }, data: { storedFileId: stored.id, lifecycleStatus, failureReason } });
    });
    return { attemptId: attempt!.id, uploadId: unavailable.id, fileId: stored.id, lifecycleStatus: unavailable.lifecycleStatus, idempotent: false };
  }

  try {
    const committed = await db.$transaction(async (tx) => {
      const current = await tx.facilitiesFileBinding.findUniqueOrThrow({ where: { id: binding.id } });
      const upload = await tx.facilitiesFileUpload.update({
        where: { id: pending.id },
        data: { storedFileId: stored.id, lifecycleStatus: FacilitiesFileLifecycleStatus.PASSED },
      });
      await tx.facilitiesFileUploadAttempt.update({ where: { id: attempt!.id }, data: { lifecycleStatus: FacilitiesFileLifecycleStatus.PASSED } });
      await tx.facilitiesFileBinding.update({ where: { id: binding.id }, data: { currentUploadId: upload.id } });
      if (current.applicationId) {
        await tx.facilitiesAuditLog.create({
          data: {
            applicationId: current.applicationId,
            actorType: AuditActorType.USER,
            actorId: input.userId!,
            action: current.currentUploadId ? "FILE_REPLACED" : "FILE_ATTACHED",
            outcome: AuditOutcome.SUCCEEDED,
            entityType: "FacilitiesFileBinding",
            entityId: current.id,
            metadata: current.currentUploadId
              ? { uploadId: upload.id, revisionId: current.currentUploadId }
              : { uploadId: upload.id, fileId: stored.id },
          },
        });
      }
      if (current.currentUploadId) {
        await tx.facilitiesFileDeletionTombstone.create({ data: { uploadId: current.currentUploadId } });
      }
      return upload;
    });
    return { attemptId: attempt!.id, uploadId: committed.id, fileId: stored.id, lifecycleStatus: committed.lifecycleStatus, idempotent: false };
  } catch (error) {
    // A promoted object with no committed database pointer is never downloadable.
    await input.storage.remove(staged.storageKey).catch(() => undefined);
    await db.storedFile.delete({ where: { id: stored.id } }).catch(() => undefined);
    await db.facilitiesFileUpload.update({
      where: { id: pending.id },
      data: { lifecycleStatus: FacilitiesFileLifecycleStatus.FAILED, failureReason: FacilitiesFileFailureReason.REPLACEMENT_FAILED },
    });
    await db.facilitiesFileUploadAttempt.update({ where: { id: attempt!.id }, data: { lifecycleStatus: FacilitiesFileLifecycleStatus.FAILED, failureReason: FacilitiesFileFailureReason.REPLACEMENT_FAILED } });
    throw error;
  }
}

/** Retry only a scanner-unavailable quarantined object. This is internal-only. */
export async function retryUnavailableFacilitiesScan(input: {
  uploadId: string;
  storage: FacilitiesPrivateStorage;
  scanner: FacilitiesFileScanner;
}) {
  const upload = await db.facilitiesFileUpload.findUnique({
    where: { id: input.uploadId },
    include: { storedFile: true, binding: true, attempt: true },
  });
  if (!upload || upload.lifecycleStatus !== FacilitiesFileLifecycleStatus.UNAVAILABLE || !upload.storedFile || upload.storedFile.scanStatus !== StoredFileScanStatus.PENDING) return false;
  const key = upload.storedFile.storageKey as FacilitiesStorageKey;
  try {
    await db.$transaction(async (tx) => {
      await tx.facilitiesFileUpload.update({ where: { id: upload.id }, data: { lifecycleStatus: FacilitiesFileLifecycleStatus.PENDING, failureReason: null } });
      if (upload.attempt) await tx.facilitiesFileUploadAttempt.update({ where: { id: upload.attempt.id }, data: { lifecycleStatus: FacilitiesFileLifecycleStatus.PENDING, failureReason: null } });
    });
  } catch {
    // A concurrent reservation can legitimately use the freed quota first.
    return false;
  }
  let bytes: Buffer;
  try {
    bytes = await input.storage.readStaging(key);
  } catch {
    await db.$transaction(async (tx) => {
      await tx.facilitiesFileUpload.update({ where: { id: upload.id }, data: { lifecycleStatus: FacilitiesFileLifecycleStatus.INTERRUPTED, failureReason: FacilitiesFileFailureReason.UPLOAD_INTERRUPTED } });
      if (upload.attempt) await tx.facilitiesFileUploadAttempt.update({ where: { id: upload.attempt.id }, data: { lifecycleStatus: FacilitiesFileLifecycleStatus.INTERRUPTED, failureReason: FacilitiesFileFailureReason.UPLOAD_INTERRUPTED } });
    });
    return false;
  }
  if (bytes.byteLength !== upload.storedFile.byteSize || !bytesMatchStoredDigest(bytes, upload.storedFile.sha256)) {
    await db.$transaction(async (tx) => {
      await tx.facilitiesFileUpload.update({ where: { id: upload.id }, data: { lifecycleStatus: FacilitiesFileLifecycleStatus.CORRUPT, failureReason: FacilitiesFileFailureReason.CONTENT_CORRUPT } });
      if (upload.attempt) await tx.facilitiesFileUploadAttempt.update({ where: { id: upload.attempt.id }, data: { lifecycleStatus: FacilitiesFileLifecycleStatus.CORRUPT, failureReason: FacilitiesFileFailureReason.CONTENT_CORRUPT } });
    });
    return false;
  }
  let scan;
  try {
    scan = await input.scanner.scan({ storageKey: key, bytes, byteSize: upload.storedFile.byteSize, sha256: upload.storedFile.sha256, fileType: upload.storedFile.fileType });
  } catch {
    await db.$transaction(async (tx) => {
      await tx.facilitiesFileUpload.update({ where: { id: upload.id }, data: { lifecycleStatus: FacilitiesFileLifecycleStatus.UNAVAILABLE, failureReason: FacilitiesFileFailureReason.SCANNER_UNAVAILABLE } });
      if (upload.attempt) await tx.facilitiesFileUploadAttempt.update({ where: { id: upload.attempt.id }, data: { lifecycleStatus: FacilitiesFileLifecycleStatus.UNAVAILABLE, failureReason: FacilitiesFileFailureReason.SCANNER_UNAVAILABLE } });
    });
    return false;
  }
  if (scan.status !== "PASSED") {
    await db.facilitiesFileUpload.update({
      where: { id: upload.id },
      data: scan.status === "UNAVAILABLE"
        ? { lifecycleStatus: FacilitiesFileLifecycleStatus.UNAVAILABLE, failureReason: FacilitiesFileFailureReason.SCANNER_UNAVAILABLE }
        : { lifecycleStatus: FacilitiesFileLifecycleStatus.FAILED, failureReason: FacilitiesFileFailureReason.SCAN_FAILED },
    });
    if (upload.attempt) await db.facilitiesFileUploadAttempt.update({
      where: { id: upload.attempt.id },
      data: scan.status === "UNAVAILABLE"
        ? { lifecycleStatus: FacilitiesFileLifecycleStatus.UNAVAILABLE, failureReason: FacilitiesFileFailureReason.SCANNER_UNAVAILABLE }
        : { lifecycleStatus: FacilitiesFileLifecycleStatus.FAILED, failureReason: FacilitiesFileFailureReason.SCAN_FAILED },
    });
    return false;
  }
  const readyKey = input.storage.createReadyKey();
  try {
    await input.storage.promote(key, readyKey);
  } catch {
    await db.$transaction(async (tx) => {
      await tx.facilitiesFileUpload.update({ where: { id: upload.id }, data: { lifecycleStatus: FacilitiesFileLifecycleStatus.UNAVAILABLE, failureReason: FacilitiesFileFailureReason.STORAGE_UNAVAILABLE } });
      if (upload.attempt) await tx.facilitiesFileUploadAttempt.update({ where: { id: upload.attempt.id }, data: { lifecycleStatus: FacilitiesFileLifecycleStatus.UNAVAILABLE, failureReason: FacilitiesFileFailureReason.STORAGE_UNAVAILABLE } });
    });
    return false;
  }
  try {
    await db.$transaction(async (tx) => {
      const current = await tx.facilitiesFileBinding.findUniqueOrThrow({ where: { id: upload.bindingId } });
      // A pending StoredFile is immutable once attached to this lifecycle row.
      // Promote by making a new immutable passed metadata record, then detach and
      // delete the staging-only record in the same transaction.
      const passed = await tx.storedFile.create({
        data: {
          storageKey: readyKey,
          originalName: upload.storedFile!.originalName,
          fileType: upload.storedFile!.fileType,
          detectedMimeType: upload.storedFile!.detectedMimeType,
          byteSize: upload.storedFile!.byteSize,
          sha256: upload.storedFile!.sha256,
          scanStatus: StoredFileScanStatus.PASSED,
          scannedAt: new Date(),
        },
      });
      await tx.facilitiesFileUpload.update({ where: { id: upload.id }, data: { storedFileId: passed.id, lifecycleStatus: FacilitiesFileLifecycleStatus.PASSED, failureReason: null } });
      if (upload.attempt) await tx.facilitiesFileUploadAttempt.update({ where: { id: upload.attempt.id }, data: { lifecycleStatus: FacilitiesFileLifecycleStatus.PASSED, failureReason: null } });
      await tx.facilitiesFileBinding.update({ where: { id: upload.bindingId }, data: { currentUploadId: upload.id } });
      if (current.applicationId) {
        await tx.facilitiesAuditLog.create({
          data: {
            applicationId: current.applicationId,
            actorType: AuditActorType.SYSTEM,
            action: current.currentUploadId ? "FILE_REPLACED" : "FILE_ATTACHED",
            outcome: AuditOutcome.SUCCEEDED,
            entityType: "FacilitiesFileBinding",
            entityId: current.id,
            metadata: current.currentUploadId ? { uploadId: upload.id, revisionId: current.currentUploadId } : { uploadId: upload.id, fileId: passed.id },
          },
        });
      }
      if (current.currentUploadId) await tx.facilitiesFileDeletionTombstone.create({ data: { uploadId: current.currentUploadId } });
      await tx.storedFile.delete({ where: { id: upload.storedFileId! } });
    });
    return true;
  } catch {
    await input.storage.remove(readyKey).catch(() => undefined);
    await db.$transaction(async (tx) => {
      await tx.facilitiesFileUpload.update({ where: { id: upload.id }, data: { lifecycleStatus: FacilitiesFileLifecycleStatus.INTERRUPTED, failureReason: FacilitiesFileFailureReason.UPLOAD_INTERRUPTED } });
      if (upload.attempt) await tx.facilitiesFileUploadAttempt.update({ where: { id: upload.attempt.id }, data: { lifecycleStatus: FacilitiesFileLifecycleStatus.INTERRUPTED, failureReason: FacilitiesFileFailureReason.UPLOAD_INTERRUPTED } });
    });
    return false;
  }
}

/**
 * Delete an obsolete object only after its committed replacement. A failed
 * deletion is represented by the tombstone and is safe to retry locally.
 */
export async function reconcileFacilitiesDeletion(input: { tombstoneId: string; storage: FacilitiesPrivateStorage }) {
  const tombstone = await db.facilitiesFileDeletionTombstone.findUnique({
    where: { id: input.tombstoneId },
    include: { upload: { include: { storedFile: true } } },
  });
  if (!tombstone) return false;
  if (tombstone.status === "SUCCEEDED") {
    if (!tombstone.upload.storedFileId) return true;
    try {
      await db.$transaction(async (tx) => {
        await tx.facilitiesFileUpload.update({ where: { id: tombstone.upload.id }, data: { storedFileId: null } });
        await tx.storedFile.delete({ where: { id: tombstone.upload.storedFileId! } });
      });
      return true;
    } catch {
      // Physical deletion is settled. Retain only safe metadata until the local
      // reconciliation command can complete this idempotent database cleanup.
      return false;
    }
  }
  if (!tombstone.upload.storedFile) return false;
  try {
    await input.storage.remove(tombstone.upload.storedFile.storageKey as FacilitiesStorageKey);
    await db.facilitiesFileDeletionTombstone.update({
      where: { id: tombstone.id },
      data: { status: "SUCCEEDED", attemptCount: { increment: 1 }, lastAttemptAt: new Date(), completedAt: new Date(), lastError: null, nextAttemptAt: null },
    });
    return reconcileFacilitiesDeletion(input);
  } catch {
    await db.facilitiesFileDeletionTombstone.update({
      where: { id: tombstone.id },
      data: { status: "RETRY_REQUIRED", attemptCount: { increment: 1 }, lastAttemptAt: new Date(), lastError: "DELETION_FAILED", nextAttemptAt: new Date(Date.now() + 60_000) },
    });
    return false;
  }
}

/** Purge terminal quarantine bytes while retaining the safe attempt/revision row. */
export async function reconcileTerminalFacilitiesQuarantine(input: { uploadId: string; storage: FacilitiesPrivateStorage }) {
  const upload = await db.facilitiesFileUpload.findUnique({ where: { id: input.uploadId }, include: { storedFile: true } });
  if (!upload?.storedFile || upload.lifecycleStatus === FacilitiesFileLifecycleStatus.PASSED || upload.lifecycleStatus === FacilitiesFileLifecycleStatus.PENDING || upload.lifecycleStatus === FacilitiesFileLifecycleStatus.UNAVAILABLE) return false;
  try {
    await input.storage.remove(upload.storedFile.storageKey as FacilitiesStorageKey);
    await db.$transaction(async (tx) => {
      await tx.facilitiesFileUpload.update({ where: { id: upload.id }, data: { storedFileId: null } });
      await tx.storedFile.delete({ where: { id: upload.storedFileId! } });
    });
    return true;
  } catch {
    return false;
  }
}

export function bytesMatchStoredDigest(bytes: Buffer, sha256: string) {
  return createHash("sha256").update(bytes).digest("hex") === sha256;
}
