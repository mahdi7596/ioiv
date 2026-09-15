import type { FacilitiesStorageKey, FilesystemFacilitiesPrivateStorage } from "@/lib/facilities-files/storage";

export type OrphanPurgeStorage = Pick<FilesystemFacilitiesPrivateStorage, "listKeysOlderThan" | "remove">;
export type OrphanPurgeSkipReason = "TTL_INVALID" | "NO_KNOWN_FILES" | "TRIPWIRE";
export type OrphanPurgeResult = { purged: number; candidates: number; skipped?: OrphanPurgeSkipReason };

const MIN_TTL_MS = 60_000;
const MIN_TRIPWIRE = 50;

/**
 * Removes on-disk objects older than the TTL that no StoredFile row references.
 * Two guards protect against deleting everything when the database is empty
 * or restored from an old backup: no known files at all, or more orphan
 * candidates than max(50, known files). Either case is skipped and reported so
 * an operator can investigate; nothing is deleted.
 */
export async function purgeOrphanedFacilitiesObjects(input: {
  storage: OrphanPurgeStorage;
  ttlMs: number;
  known: Set<string>;
  maxCandidates?: number;
}): Promise<OrphanPurgeResult> {
  if (!Number.isSafeInteger(input.ttlMs) || input.ttlMs < MIN_TTL_MS) return { purged: 0, candidates: 0, skipped: "TTL_INVALID" };

  const candidates = (await input.storage.listKeysOlderThan(input.ttlMs)).filter((key) => !input.known.has(key));
  if (!candidates.length) return { purged: 0, candidates: 0 };
  if (input.known.size === 0) return { purged: 0, candidates: candidates.length, skipped: "NO_KNOWN_FILES" };
  const tripwire = input.maxCandidates ?? Math.max(MIN_TRIPWIRE, input.known.size);
  if (candidates.length > tripwire) return { purged: 0, candidates: candidates.length, skipped: "TRIPWIRE" };

  let purged = 0;
  for (const key of candidates as FacilitiesStorageKey[]) {
    await input.storage.remove(key);
    purged += 1;
  }
  return { purged, candidates: candidates.length };
}
