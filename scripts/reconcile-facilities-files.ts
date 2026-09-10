import { db } from "@/lib/db";
import { createFacilitiesScannerFromEnv } from "@/lib/facilities-files/scanner";
import { reconcileFacilitiesDeletion, reconcileTerminalFacilitiesQuarantine, retryUnavailableFacilitiesScan } from "@/lib/facilities-files/service";
import { FilesystemFacilitiesPrivateStorage } from "@/lib/facilities-files/storage";

/**
 * Maintenance-only reconciliation. It is intentionally not called on app
 * startup: operators schedule it after scanner/storage readiness is established.
 * Output contains opaque record IDs and counts only, never keys, names or content.
 */
async function main() {
  const storage = new FilesystemFacilitiesPrivateStorage();
  const scanner = createFacilitiesScannerFromEnv();
  const now = new Date();
  const unavailable = await db.facilitiesFileUpload.findMany({
    where: { lifecycleStatus: "UNAVAILABLE", storedFile: { is: { scanStatus: "PENDING" } } },
    select: { id: true },
    take: 100,
  });
  let rescanned = 0;
  for (const upload of unavailable) {
    if (await retryUnavailableFacilitiesScan({ uploadId: upload.id, storage, scanner })) rescanned += 1;
  }

  const terminalQuarantine = await db.facilitiesFileUpload.findMany({
    where: { lifecycleStatus: { in: ["FAILED", "CORRUPT", "INTERRUPTED", "DISALLOWED", "OVERSIZED", "DUPLICATE"] }, storedFileId: { not: null } },
    select: { id: true },
    take: 100,
  });
  let quarantinesPurged = 0;
  for (const upload of terminalQuarantine) {
    if (await reconcileTerminalFacilitiesQuarantine({ uploadId: upload.id, storage })) quarantinesPurged += 1;
  }

  const tombstones = await db.facilitiesFileDeletionTombstone.findMany({
    where: {
      OR: [
        { status: "PENDING" },
        { status: "RETRY_REQUIRED", nextAttemptAt: { lte: now } },
        { status: "SUCCEEDED" },
      ],
    },
    select: { id: true },
    take: 100,
  });
  let deleted = 0;
  for (const tombstone of tombstones) {
    if (await reconcileFacilitiesDeletion({ tombstoneId: tombstone.id, storage })) deleted += 1;
  }

  // A crash after private promotion but before its metadata transaction can leave
  // an untracked key. Reap only objects older than the conservative local TTL.
  const ttl = Number(process.env.FACILITIES_ORPHAN_TTL_MS ?? 86_400_000);
  const known = new Set((await db.storedFile.findMany({ select: { storageKey: true } })).map((file) => file.storageKey));
  let orphanedPurged = 0;
  if (Number.isSafeInteger(ttl) && ttl >= 60_000) {
    for (const key of await storage.listKeysOlderThan(ttl)) {
      if (!known.has(key)) {
        await storage.remove(key);
        orphanedPurged += 1;
      }
    }
  }
  console.info(JSON.stringify({ event: "facilities_file_reconciliation_completed", rescanned, quarantinesPurged, deleted, orphanedPurged }));
}

main()
  .catch(() => {
    console.error(JSON.stringify({ event: "facilities_file_reconciliation_failed" }));
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
