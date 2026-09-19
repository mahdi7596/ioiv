import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tombstoneFind: vi.fn(),
  tombstoneUpdate: vi.fn(),
  uploadFind: vi.fn(),
  uploadUpdate: vi.fn(),
  storedFileDelete: vi.fn(),
  transaction: vi.fn(),
  tombstoneUpsert: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {
  facilitiesFileDeletionTombstone: { findUnique: mocks.tombstoneFind, update: mocks.tombstoneUpdate, updateMany: mocks.tombstoneUpdate },
  facilitiesFileUpload: { findUnique: mocks.uploadFind },
  $transaction: mocks.transaction,
} }));

import { reconcileFacilitiesDeletion, reconcileTerminalFacilitiesQuarantine } from "@/lib/facilities-files/service";
import { purgeOrphanedFacilitiesObjects } from "@/lib/facilities-files/orphans";
import type { FacilitiesPrivateStorage } from "@/lib/facilities-files/storage";

function storage(remove: () => Promise<void>): FacilitiesPrivateStorage {
  return {
    createStagingKey: () => "staging/00000000-0000-4000-8000-000000000001",
    createReadyKey: () => "ready/00000000-0000-4000-8000-000000000002",
    writeStaging: async () => undefined,
    readStaging: async () => Buffer.alloc(0),
    readReady: async () => Buffer.alloc(0),
    promote: async () => undefined,
    remove,
  };
}

describe("facilities reconciliation recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tombstoneUpdate.mockResolvedValue({});
    mocks.tombstoneUpsert.mockResolvedValue({id:"tombstone-1"});
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      $executeRaw: vi.fn(), $queryRaw: vi.fn().mockResolvedValue([{protected:false}]),
      facilitiesFileBinding: {findUniqueOrThrow: vi.fn().mockResolvedValue({id:"binding-1",currentUploadId:"newer-upload"})},
      facilitiesFileDeletionTombstone: {findUniqueOrThrow:mocks.tombstoneFind,update:mocks.tombstoneUpdate,upsert:mocks.tombstoneUpsert},
      facilitiesFileUpload: {findUniqueOrThrow:mocks.uploadFind,update:mocks.uploadUpdate},
      storedFile: {delete:mocks.storedFileDelete},
    }));
  });

  it("records a retry tombstone when physical deletion is unavailable", async () => {
    mocks.tombstoneFind.mockResolvedValue({ id: "tombstone-1", status: "PENDING", uploadId: "upload-1", upload: { id: "upload-1", bindingId:"binding-1", storedFileId: "file-1", storedFile: { id:"file-1", storageKey: "ready/00000000-0000-4000-8000-000000000002" } } });
    await expect(reconcileFacilitiesDeletion({ tombstoneId: "tombstone-1", storage: storage(async () => { throw new Error("storage unavailable"); }) })).resolves.toBe(false);
    expect(mocks.tombstoneUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "RETRY_REQUIRED", lastError: "DELETION_FAILED" }) }));
  });

  it("treats a missing physical object as idempotent deletion success", async () => {
    mocks.tombstoneFind
      .mockResolvedValueOnce({ id: "tombstone-1", status: "PENDING", uploadId: "upload-1", upload: { id: "upload-1", bindingId:"binding-1", storedFileId: "file-1", storedFile: { id:"file-1", storageKey: "ready/00000000-0000-4000-8000-000000000002" } } })
      .mockResolvedValue({ id: "tombstone-1", status: "PENDING", uploadId:"upload-1", upload:{id:"upload-1",bindingId:"binding-1",storedFileId:"file-1",storedFile:{id:"file-1",storageKey:"ready/00000000-0000-4000-8000-000000000002"}} });
    await expect(reconcileFacilitiesDeletion({ tombstoneId: "tombstone-1", storage: storage(async () => undefined) })).resolves.toBe(true);
    expect(mocks.tombstoneUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SUCCEEDED" }) }));
  });

  it("retains terminal metadata when quarantine-byte purge fails", async () => {
    mocks.uploadFind.mockResolvedValue({ id: "upload-1", storedFileId: "file-1", lifecycleStatus: "FAILED", storedFile: { id:"file-1", storageKey: "staging/00000000-0000-4000-8000-000000000001" } });
    await expect(reconcileTerminalFacilitiesQuarantine({ uploadId: "upload-1", storage: storage(async () => { throw new Error("storage unavailable"); }) })).resolves.toBe(false);
    expect(mocks.uploadUpdate).not.toHaveBeenCalled();
    expect(mocks.storedFileDelete).not.toHaveBeenCalled();
  });
});

describe("orphan purge guard", () => {
  const keys = (count: number) => Array.from({ length: count }, (_, index) => `ready/${String(index).padStart(8, "0")}-0000-4000-8000-000000000000` as const);
  function orphanStorage(listed: string[]) {
    const remove = vi.fn(async () => undefined);
    return { storage: { listKeysOlderThan: async () => listed as never, remove }, remove };
  }

  it("refuses to purge when the database knows no files at all", async () => {
    const { storage, remove } = orphanStorage(keys(1));
    await expect(purgeOrphanedFacilitiesObjects({ storage, ttlMs: 86_400_000, known: new Set() })).resolves.toEqual({ purged: 0, candidates: 1, skipped: "NO_KNOWN_FILES" });
    expect(remove).not.toHaveBeenCalled();
  });

  it("trips when orphan candidates outnumber known files by more than the threshold", async () => {
    const { storage, remove } = orphanStorage(keys(60));
    await expect(purgeOrphanedFacilitiesObjects({ storage, ttlMs: 86_400_000, known: new Set(keys(10).slice(0, 10).map((key) => `${key}-known`)) })).resolves.toMatchObject({ purged: 0, skipped: "TRIPWIRE" });
    expect(remove).not.toHaveBeenCalled();
  });

  it("purges only unknown keys under normal conditions and rejects a short TTL", async () => {
    const listed = keys(3);
    const { storage, remove } = orphanStorage(listed);
    await expect(purgeOrphanedFacilitiesObjects({ storage, ttlMs: 86_400_000, known: new Set([listed[0]]) })).resolves.toEqual({ purged: 2, candidates: 2 });
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).not.toHaveBeenCalledWith(listed[0]);
    await expect(purgeOrphanedFacilitiesObjects({ storage, ttlMs: 1_000, known: new Set([listed[0]]) })).resolves.toMatchObject({ skipped: "TTL_INVALID" });
  });
});
