import { db } from "@/lib/db";
import { purgeOrphanedFacilitiesObjects, type OrphanPurgeStorage } from "@/lib/facilities-files/orphans";

/** Upload admission takes the shared counterpart in its database trigger.
 * While any storage writer is pending, defer orphan removal. The exclusive lock
 * blocks admission while held; frozen names preserve safety after lock timeout.
 */
export async function reconcileFacilitiesOrphans(input: { storage: OrphanPurgeStorage; ttlMs: number; maxCandidates?: number }) {
  if (!Number.isSafeInteger(input.ttlMs) || input.ttlMs < 60_000) {
    return { purged: 0, candidates: 0, skipped: "TTL_INVALID" as const };
  }
  // Freeze names before taking the lock. Even if transaction timeout releases it
  // during slow I/O, a later admission creates fresh UUID keys outside this list.
  const candidates = await input.storage.listKeysOlderThan(input.ttlMs);
  return db.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(730180801)::text`;
    if (await tx.facilitiesFileUpload.count({ where: { lifecycleStatus: "PENDING" } })) {
      return { purged: 0, candidates: 0, skipped: "ACTIVE_UPLOAD" as const };
    }
    const known = new Set((await tx.storedFile.findMany({ select: { storageKey: true } })).map(file => file.storageKey));
    return purgeOrphanedFacilitiesObjects({ ...input, known, storage: {
      listKeysOlderThan: async () => candidates,
      remove: key => input.storage.remove(key),
    } });
  }, { maxWait: 3000, timeout: 5000 });
}
