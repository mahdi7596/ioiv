import { AuditActorType, AuditOutcome, FacilitiesAuditAction, FacilitiesFileLifecycleStatus } from "@prisma/client";

import { facilitiesRequestId, writeFacilitiesAudit } from "@/lib/audit/facilities";
import { db } from "@/lib/db";
import { createFacilitiesScannerFromEnv } from "@/lib/facilities-files/scanner";
import { reconcileFacilitiesDeletion, reconcileTerminalFacilitiesQuarantine, retryUnavailableFacilitiesScan } from "@/lib/facilities-files/service";
import { FilesystemFacilitiesPrivateStorage } from "@/lib/facilities-files/storage";
import { FACILITIES_UNAVAILABLE_RETENTION_MS } from "@/lib/facilities-files/retention";

const BATCH_SIZE = 100;
const RECONCILIATION_LOCK_ID = 730_180_800;

async function reconcile() {
  const startedAt = Date.now();
  const storage = new FilesystemFacilitiesPrivateStorage();
  const scanner = createFacilitiesScannerFromEnv();
  const now = new Date();
  const unavailableCutoff = new Date(now.getTime() - FACILITIES_UNAVAILABLE_RETENTION_MS);
  const requestId = facilitiesRequestId();
  const oldestUnavailable = await db.facilitiesFileUpload.findFirst({ where: { lifecycleStatus: "UNAVAILABLE" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  const backlogAgeMs = oldestUnavailable ? Math.max(0, now.getTime() - oldestUnavailable.createdAt.getTime()) : 0;

  const expired = await db.facilitiesFileUpload.findMany({ where: { lifecycleStatus: "UNAVAILABLE", createdAt: { lte: unavailableCutoff }, storedFileId: { not: null } }, include: { binding: { select: { applicationId: true } }, attempt: { select: { id: true } } }, take: BATCH_SIZE });
  let expiredPurged = 0;
  let expiryPurgeFailures = 0;
  for (const upload of expired) {
    await db.$transaction(async (tx) => {
      await tx.facilitiesFileUpload.update({ where: { id: upload.id }, data: { lifecycleStatus: FacilitiesFileLifecycleStatus.FAILED } });
      if (upload.attempt) await tx.facilitiesFileUploadAttempt.update({ where: { id: upload.attempt.id }, data: { lifecycleStatus: FacilitiesFileLifecycleStatus.FAILED } });
      if (upload.binding.applicationId) await writeFacilitiesAudit(tx, { actorType: AuditActorType.SYSTEM, action: FacilitiesAuditAction.QUARANTINE_EXPIRED, outcome: AuditOutcome.FAILED, entityType: "FacilitiesFileUpload", entityId: upload.id, applicationId: upload.binding.applicationId, metadata: { reasonCode: "RETENTION_EXPIRED", retentionHours: 24 }, requestId });
    });
    if (await reconcileTerminalFacilitiesQuarantine({ uploadId: upload.id, storage })) expiredPurged += 1;
    else expiryPurgeFailures += 1;
  }

  const unavailable = await db.facilitiesFileUpload.findMany({ where: { lifecycleStatus: "UNAVAILABLE", createdAt: { gt: unavailableCutoff }, storedFile: { is: { scanStatus: "PENDING" } } }, select: { id: true }, take: BATCH_SIZE });
  let rescanned = 0;
  let retryFailures = 0;
  for (const upload of unavailable) {
    if (await retryUnavailableFacilitiesScan({ uploadId: upload.id, storage, scanner })) rescanned += 1;
    else {
      const current = await db.facilitiesFileUpload.findUnique({ where: { id: upload.id }, select: { lifecycleStatus: true } });
      if (current?.lifecycleStatus === "UNAVAILABLE" || current?.lifecycleStatus === "PENDING") retryFailures += 1;
    }
  }

  const terminal = await db.facilitiesFileUpload.findMany({ where: { lifecycleStatus: { in: ["FAILED", "CORRUPT", "INTERRUPTED", "DISALLOWED", "OVERSIZED", "DUPLICATE"] }, storedFileId: { not: null } }, select: { id: true }, take: BATCH_SIZE });
  let quarantinesPurged = 0;
  let quarantinePurgeFailures = 0;
  for (const upload of terminal) {
    if (await reconcileTerminalFacilitiesQuarantine({ uploadId: upload.id, storage })) quarantinesPurged += 1;
    else quarantinePurgeFailures += 1;
  }

  const tombstones = await db.facilitiesFileDeletionTombstone.findMany({ where: { OR: [{ status: "PENDING" }, { status: "RETRY_REQUIRED", nextAttemptAt: { lte: now } }, { status: "SUCCEEDED" }] }, select: { id: true }, take: BATCH_SIZE });
  let deleted = 0;
  let deletionFailures = 0;
  for (const tombstone of tombstones) {
    if (await reconcileFacilitiesDeletion({ tombstoneId: tombstone.id, storage })) deleted += 1;
    else deletionFailures += 1;
  }

  const ttl = Number(process.env.FACILITIES_ORPHAN_TTL_MS ?? FACILITIES_UNAVAILABLE_RETENTION_MS);
  const known = new Set((await db.storedFile.findMany({ select: { storageKey: true } })).map((file) => file.storageKey));
  let orphanedPurged = 0;
  if (Number.isSafeInteger(ttl) && ttl >= 60_000) for (const key of await storage.listKeysOlderThan(ttl)) if (!known.has(key)) { await storage.remove(key); orphanedPurged += 1; }

  const counts = { expired: expired.length, expiredPurged, rescanned, quarantinesPurged, deleted, orphanedPurged, expiryPurgeFailures, retryFailures, quarantinePurgeFailures, deletionFailures };
  const infrastructureFailures = expiryPurgeFailures + retryFailures + quarantinePurgeFailures + deletionFailures;
  if (infrastructureFailures > 0) {
    console.error(JSON.stringify({ event: "facilities_file_reconciliation_incomplete", requestId, reasonCode: "DEPENDENCY_FAILURE", durationMs: Date.now() - startedAt, backlogAgeMs, ...counts }));
    throw new Error("FACILITIES_RECONCILIATION_DEPENDENCY_FAILURE");
  }
  await writeFacilitiesAudit(db, { actorType: AuditActorType.SYSTEM, action: FacilitiesAuditAction.RECONCILIATION_COMPLETED, entityType: "FacilitiesFileReconciliation", entityId: requestId, metadata: { recordCount: Object.values(counts).reduce((sum, value) => sum + value, 0), retentionHours: 24 }, requestId });
  console.info(JSON.stringify({ event: "facilities_file_reconciliation_completed", requestId, durationMs: Date.now() - startedAt, backlogAgeMs, ...counts }));
  return true;
}

async function main() {
  const completed = await db.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(${RECONCILIATION_LOCK_ID}) AS locked`;
    if (!row?.locked) return false;
    return reconcile();
  }, { timeout: 300_000, maxWait: 10_000 });
  if (!completed) {
    console.warn(JSON.stringify({ event: "facilities_file_reconciliation_skipped", reasonCode: "LOCK_HELD" }));
    process.exitCode = 2;
  }
}

main().catch(() => { console.error(JSON.stringify({ event: "facilities_file_reconciliation_failed", reasonCode: "UNEXPECTED" })); process.exitCode = 1; }).finally(async () => db.$disconnect());
