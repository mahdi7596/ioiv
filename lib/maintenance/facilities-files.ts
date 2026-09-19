import { AuditActorType, FacilitiesAuditAction } from "@prisma/client";

import { facilitiesRequestId, writeFacilitiesAudit } from "@/lib/audit/facilities";
import { db } from "@/lib/db";
import { ActionError } from "@/lib/actions/auth";
import { assertBindingEditable } from "@/lib/facilities-files/coordination";
import { createFacilitiesScannerFromEnv } from "@/lib/facilities-files/scanner";
import { reconcileFacilitiesDeletion, reconcileTerminalFacilitiesQuarantine, retryUnavailableFacilitiesScan, expireFacilitiesUpload } from "@/lib/facilities-files/service";
import { FilesystemFacilitiesPrivateStorage } from "@/lib/facilities-files/storage";
import { FACILITIES_UNAVAILABLE_RETENTION_MS } from "@/lib/facilities-files/retention";
import { reconcileFacilitiesOrphans } from "@/lib/facilities-files/orphan-reconciliation";

const BATCH_SIZE = 100;
import { maintenancePage, advanceMaintenanceCursor, rotatedMaintenanceQueues } from "./cursor";
import type { FileJobResult } from "./file-job";

export async function reconcileFacilitiesFiles(deadline: number): Promise<FileJobResult> {
  const storage = new FilesystemFacilitiesPrivateStorage();
  const scanner = createFacilitiesScannerFromEnv();
  const [clock] = await db.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  const now = clock.now;
  const unavailableCutoff = new Date(now.getTime() - FACILITIES_UNAVAILABLE_RETENTION_MS);
  const requestId = facilitiesRequestId();
  const oldestUnavailable = await db.facilitiesFileUpload.findFirst({ where: { lifecycleStatus: "UNAVAILABLE" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  const backlogAgeMs = oldestUnavailable ? Math.max(0, now.getTime() - oldestUnavailable.createdAt.getTime()) : 0;

  let expiredPurged = 0, expiryPurgeFailures = 0, rescanned = 0, retryFailures = 0, quarantinesPurged = 0, quarantinePurgeFailures = 0, deleted = 0, deletionFailures = 0, expiredCount = 0, orphanedPurged = 0;
  let orphans: {purged: number; candidates: number; skipped?: string} = {purged: 0, candidates: 0, skipped: "TIME_BUDGET"};
  const readUnavailable = (afterId: string | null, limit: number) => db.$queryRaw<Array<{ id: string }>>`
    SELECT u."id" FROM "FacilitiesFileUpload" u
    JOIN "FacilitiesFileBinding" b ON b."id"=u."bindingId"
    JOIN "StoredFile" f ON f."id"=u."storedFileId"
    WHERE (${afterId}::text IS NULL OR u."id">${afterId}) AND u."lifecycleStatus"='UNAVAILABLE' AND u."createdAt">${unavailableCutoff}
      AND f."scanStatus"='PENDING' AND u."replacesUploadId" IS NOT DISTINCT FROM b."currentUploadId"
      AND (b."applicationId" IS NULL OR EXISTS (SELECT 1 FROM "FacilitiesApplication" a WHERE a."id"=b."applicationId" AND a."status" IN ('DRAFT','NEEDS_EDIT')))
      AND (b."scope" <> 'COMPANY_PROFILE' OR NOT EXISTS (SELECT 1 FROM "FacilitiesApplication" a WHERE a."companyId"=b."companyId" AND a."status" IN ('PENDING_PAYMENT','SUBMITTED','UNDER_REVIEW')))
      AND (b."scope" <> 'QUESTIONNAIRE_TEMPLATE' OR EXISTS (SELECT 1 FROM "Admin" a WHERE a."id"=b."adminId" AND a."active" AND a."role"='SUPER_ADMIN'))
    ORDER BY u."id" LIMIT ${limit}`;
  const queue0 = async (queueDeadline: number) => {
  const expired = await maintenancePage("facilities-expired", afterId => db.facilitiesFileUpload.findMany({ where: { ...(afterId ? { id: { gt: afterId } } : {}), lifecycleStatus: { in: ["UNAVAILABLE", "PENDING"] }, createdAt: { lte: unavailableCutoff } }, include: { binding: { select: { applicationId: true } }, attempt: { select: { id: true } } }, orderBy: { id: "asc" }, take: BATCH_SIZE }));
  expiredCount = expired.length;
  for (const upload of expired) {
    if (Date.now() >= queueDeadline) break;
    await advanceMaintenanceCursor("facilities-expired", upload.id);
    if (!await expireFacilitiesUpload(upload.id)) continue;
    if (!upload.storedFileId) continue;
    if (await reconcileTerminalFacilitiesQuarantine({ uploadId: upload.id, storage })) expiredPurged += 1;
    else expiryPurgeFailures += 1;
  }

  };
  const queue1 = async (queueDeadline: number) => {
  const unavailable = await maintenancePage("facilities-unavailable", afterId => readUnavailable(afterId, BATCH_SIZE));
  for (const upload of unavailable) {
    if (Date.now() + 16000 >= queueDeadline) break;
    await advanceMaintenanceCursor("facilities-unavailable", upload.id);
    if (await retryUnavailableFacilitiesScan({ uploadId: upload.id, storage, scanner })) rescanned += 1;
    else {
      const current = await db.facilitiesFileUpload.findUnique({ where: { id: upload.id }, select: { lifecycleStatus: true, replacesUploadId: true, binding: true } });
      if (current && current.replacesUploadId === current.binding.currentUploadId && (current.lifecycleStatus === "UNAVAILABLE" || current.lifecycleStatus === "PENDING")) {
        try { await assertBindingEditable(db, current.binding); retryFailures += 1; }
        catch (error) {
          const retained = (error instanceof ActionError && error.status === 409) ||
            (error instanceof Error && ["FACILITIES_APPLICATION_NOT_EDITABLE", "FACILITIES_FILE_FORBIDDEN"].includes(error.message));
          if (!retained) retryFailures += 1;
        }
      }
    }
  }

  };
  const queue2 = async (queueDeadline: number) => {
  const terminal = await maintenancePage("facilities-terminal", afterId => db.facilitiesFileUpload.findMany({ where: { ...(afterId ? { id: { gt: afterId } } : {}), lifecycleStatus: { in: ["FAILED", "CORRUPT", "INTERRUPTED", "DISALLOWED", "OVERSIZED", "DUPLICATE"] }, storedFileId: { not: null } }, select: { id: true }, orderBy: { id: "asc" }, take: BATCH_SIZE }));
  for (const upload of terminal) {
    if (Date.now() >= queueDeadline) break;
    await advanceMaintenanceCursor("facilities-terminal", upload.id);
    if (await reconcileTerminalFacilitiesQuarantine({ uploadId: upload.id, storage })) quarantinesPurged += 1;
    else quarantinePurgeFailures += 1;
  }

  };
  const queue3 = async (queueDeadline: number) => {
  const tombstones = await maintenancePage("facilities-tombstones", afterId => db.facilitiesFileDeletionTombstone.findMany({ where: { ...(afterId ? { id: { gt: afterId } } : {}), OR: [{ status: "PENDING" }, { status: "RETRY_REQUIRED", nextAttemptAt: { lte: now } }, { status: "SUCCEEDED", upload: { storedFileId: { not: null } } }] }, orderBy: { id: "asc" }, select: { id: true }, take: BATCH_SIZE }));
  for (const tombstone of tombstones) {
    if (Date.now() >= queueDeadline) break;
    await advanceMaintenanceCursor("facilities-tombstones", tombstone.id);
    if (await reconcileFacilitiesDeletion({ tombstoneId: tombstone.id, storage })) deleted += 1;
    else deletionFailures += 1;
  }

  };
  const queue4 = async (queueDeadline: number) => {
  const ttl = Number(process.env.FACILITIES_ORPHAN_TTL_MS ?? FACILITIES_UNAVAILABLE_RETENTION_MS);
  const maxCandidates = process.env.FACILITIES_ORPHAN_PURGE_MAX ? Number(process.env.FACILITIES_ORPHAN_PURGE_MAX) : undefined;
  orphans = Date.now() + 6000 >= queueDeadline ? { purged: 0, candidates: 0, skipped: "TIME_BUDGET" } : await reconcileFacilitiesOrphans({ storage, ttlMs: ttl, maxCandidates: Number.isSafeInteger(maxCandidates) && maxCandidates! > 0 ? maxCandidates : undefined });
  orphanedPurged = orphans.purged;
  if (orphans.skipped) {
    // Not an infrastructure failure: nothing was deleted. Monitoring should alert on this event.
    console.warn(JSON.stringify({ event: "facilities_orphan_purge_skipped", requestId, reasonCode: orphans.skipped, candidates: orphans.candidates }));
  }

  };
  for (const entry of await rotatedMaintenanceQueues("facilities-queue-order", [{run: queue0, ms: 8000}, {run: queue1, ms: 20000}, {run: queue2, ms: 8000}, {run: queue3, ms: 8000}, {run: queue4, ms: 8000}])) {
    await entry.run(Math.min(deadline - 5000, Date.now() + entry.ms));
  }
  const remainingExpired = await db.facilitiesFileUpload.count({ where: { lifecycleStatus: { in: ["UNAVAILABLE", "PENDING"] }, createdAt: { lte: unavailableCutoff } } });
  const remainingTerminal = await db.facilitiesFileUpload.count({ where: { lifecycleStatus: { in: ["FAILED", "CORRUPT", "INTERRUPTED", "DISALLOWED", "OVERSIZED", "DUPLICATE"] }, storedFileId: { not: null } } });
  const remainingDeletion = await db.facilitiesFileDeletionTombstone.count({ where: { OR: [{ status: { in: ["PENDING", "RETRY_REQUIRED"] } }, { status: "SUCCEEDED", upload: { storedFileId: { not: null } } }] } });
  const hasRemainingScan = (await readUnavailable(null, 1)).length;
  const counts = { expired: expiredCount, expiredPurged, rescanned, quarantinesPurged, deleted, orphanedPurged, expiryPurgeFailures, retryFailures, quarantinePurgeFailures, deletionFailures, remainingExpired, remainingTerminal, remainingDeletion, hasRemainingScan };
  const incomplete = Boolean(orphans.skipped) || expiryPurgeFailures + retryFailures + quarantinePurgeFailures + deletionFailures + remainingExpired + remainingTerminal + remainingDeletion + hasRemainingScan > 0;
  return { state: incomplete ? "incomplete" : "completed", reasonCode: incomplete ? "RETRY_OR_BACKLOG_OR_GUARD" : undefined, requestId, backlogAgeMs, orphanPurgeSkipped: orphans.skipped ?? null, counts };
}

export async function recordFacilitiesCompletion(result: FileJobResult) {
  const requestId = String(result.requestId);
  await writeFacilitiesAudit(db, { actorType: AuditActorType.SYSTEM, action: FacilitiesAuditAction.RECONCILIATION_COMPLETED, entityType: "FacilitiesFileReconciliation", entityId: requestId, metadata: { recordCount: Object.values(result.counts).reduce((sum, value) => sum + value, 0), retentionHours: 24 }, requestId });
}
