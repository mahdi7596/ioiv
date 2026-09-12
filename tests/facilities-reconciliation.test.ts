import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tombstoneFind: vi.fn(),
  tombstoneUpdate: vi.fn(),
  uploadFind: vi.fn(),
  uploadUpdate: vi.fn(),
  storedFileDelete: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {
  facilitiesFileDeletionTombstone: { findUnique: mocks.tombstoneFind, update: mocks.tombstoneUpdate },
  facilitiesFileUpload: { findUnique: mocks.uploadFind },
  $transaction: mocks.transaction,
} }));

import { reconcileFacilitiesDeletion, reconcileTerminalFacilitiesQuarantine } from "@/lib/facilities-files/service";
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
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({ facilitiesFileUpload: { update: mocks.uploadUpdate }, storedFile: { delete: mocks.storedFileDelete } }));
  });

  it("records a retry tombstone when physical deletion is unavailable", async () => {
    mocks.tombstoneFind.mockResolvedValue({ id: "tombstone-1", status: "PENDING", upload: { id: "upload-1", storedFileId: "file-1", storedFile: { storageKey: "ready/00000000-0000-4000-8000-000000000002" } } });
    await expect(reconcileFacilitiesDeletion({ tombstoneId: "tombstone-1", storage: storage(async () => { throw new Error("storage unavailable"); }) })).resolves.toBe(false);
    expect(mocks.tombstoneUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "RETRY_REQUIRED", lastError: "DELETION_FAILED" }) }));
  });

  it("treats a missing physical object as idempotent deletion success", async () => {
    mocks.tombstoneFind
      .mockResolvedValueOnce({ id: "tombstone-1", status: "PENDING", upload: { id: "upload-1", storedFileId: "file-1", storedFile: { storageKey: "ready/00000000-0000-4000-8000-000000000002" } } })
      .mockResolvedValueOnce({ id: "tombstone-1", status: "SUCCEEDED", upload: { id: "upload-1", storedFileId: null, storedFile: null } });
    await expect(reconcileFacilitiesDeletion({ tombstoneId: "tombstone-1", storage: storage(async () => undefined) })).resolves.toBe(true);
    expect(mocks.tombstoneUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SUCCEEDED" }) }));
  });

  it("retains terminal metadata when quarantine-byte purge fails", async () => {
    mocks.uploadFind.mockResolvedValue({ id: "upload-1", storedFileId: "file-1", lifecycleStatus: "FAILED", storedFile: { storageKey: "staging/00000000-0000-4000-8000-000000000001" } });
    await expect(reconcileTerminalFacilitiesQuarantine({ uploadId: "upload-1", storage: storage(async () => { throw new Error("storage unavailable"); }) })).resolves.toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
