import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  bindingFindFirst: vi.fn(),
  programmeFindUnique: vi.fn(),
  applicationCount: vi.fn(),
  verifyFacilitiesUpload: vi.fn(),
  storeOwnedFacilitiesFile: vi.fn(),
  admit: vi.fn(),
  release: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db", () => ({
  db: {
    facilitiesFileBinding: { findFirst: mocks.bindingFindFirst },
    facilitiesProgramConfiguration: { findUnique: mocks.programmeFindUnique },
    facilitiesApplication: { count: mocks.applicationCount },
  },
}));
vi.mock("@/lib/facilities-files/verification", () => ({ verifyFacilitiesUpload: mocks.verifyFacilitiesUpload, MAX_FACILITIES_FILE_BYTES: 25 * 1024 * 1024 }));
vi.mock("@/lib/facilities-files/service", () => ({ storeOwnedFacilitiesFile: mocks.storeOwnedFacilitiesFile }));
vi.mock("@/lib/facilities-files/storage", () => ({ FilesystemFacilitiesPrivateStorage: class {} }));
vi.mock("@/lib/facilities-files/scanner", () => ({ createFacilitiesScannerFromEnv: () => ({ scan: async () => ({ status: "PASSED" }) }) }));
vi.mock("@/lib/uploads/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/uploads/rate-limit")>();
  return { ...actual, uploadRateLimiter: { admit: mocks.admit } };
});
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { POST } from "@/app/api/facilities/application-files/route";

function request(fields: Record<string, string>, file: File | null = new File(["PK"], "book.xlsx"), headers: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  if (file) form.set("file", file);
  return new Request("http://test.local/api/facilities/application-files", { method: "POST", body: form, headers });
}

describe("facilities application-files route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ kind: "user", subjectId: "user-1" });
    mocks.programmeFindUnique.mockResolvedValue({ isEnabled: true });
    mocks.applicationCount.mockResolvedValue(0);
    mocks.verifyFacilitiesUpload.mockReturnValue({ fileType: "XLSX" });
    mocks.storeOwnedFacilitiesFile.mockResolvedValue({ attemptId: "a-1", uploadId: "u-1", fileId: "f-1", lifecycleStatus: "PASSED", idempotent: false });
    mocks.admit.mockReturnValue({ ok: true, release: mocks.release });
  });

  it("rejects an oversized declared body before admission or parsing", async () => {
    mocks.bindingFindFirst.mockResolvedValue({ id: "b-1", applicationId: "app-1", slotKey: "insurance" });

    const response = await POST(request({ bindingId: "b-1", idempotencyKey: "k".repeat(20) }, undefined, { "content-length": String(40 * 1024 * 1024) }));

    expect(response.status).toBe(413);
    expect(mocks.admit).not.toHaveBeenCalled();
    expect(mocks.bindingFindFirst).not.toHaveBeenCalled();
  });

  it("returns 429 and parses nothing when the upload limiter denies admission", async () => {
    mocks.admit.mockReturnValue({ ok: false, reason: "USER_HOURLY" });

    const response = await POST(request({ bindingId: "b-1", idempotencyKey: "k".repeat(20) }, undefined, { "x-real-ip": "5.5.5.5" }));

    expect(response.status).toBe(429);
    expect(mocks.admit).toHaveBeenCalledWith({ subjectId: "user-1", clientIp: "5.5.5.5" });
    expect(mocks.bindingFindFirst).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("releases the admission slot after success and after a failure", async () => {
    mocks.bindingFindFirst.mockResolvedValue({ id: "b-1", applicationId: "app-1", slotKey: "insurance" });
    expect((await POST(request({ bindingId: "b-1", idempotencyKey: "k".repeat(20) }))).status).toBe(200);
    expect(mocks.release).toHaveBeenCalledTimes(1);

    mocks.storeOwnedFacilitiesFile.mockRejectedValueOnce(new Error("disk full"));
    expect((await POST(request({ bindingId: "b-1", idempotencyKey: "k".repeat(20) }))).status).toBe(400);
    expect(mocks.release).toHaveBeenCalledTimes(2);
  });

  it("rejects an unowned or unknown binding before parsing any file content", async () => {
    mocks.bindingFindFirst.mockResolvedValue(null);

    const response = await POST(request({ bindingId: "someone-elses", idempotencyKey: "k".repeat(20) }));

    expect(response.status).toBe(400);
    expect(mocks.verifyFacilitiesUpload).not.toHaveBeenCalled();
    expect(mocks.storeOwnedFacilitiesFile).not.toHaveBeenCalled();
    expect(mocks.bindingFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "someone-elses", userId: "user-1", scope: "APPLICATION" }) }));
  });

  it("rejects uploads while the programme is disabled without parsing, unless a correction is open", async () => {
    mocks.bindingFindFirst.mockResolvedValue({ id: "b-1", applicationId: "app-1", slotKey: "insurance" });
    mocks.programmeFindUnique.mockResolvedValue({ isEnabled: false });

    const closed = await POST(request({ bindingId: "b-1", idempotencyKey: "k".repeat(20) }));
    expect(closed.status).toBe(400);
    expect(mocks.verifyFacilitiesUpload).not.toHaveBeenCalled();

    mocks.applicationCount.mockResolvedValue(1);
    const correction = await POST(request({ bindingId: "b-1", idempotencyKey: "k".repeat(20) }));
    expect(correction.status).toBe(200);
    expect(mocks.verifyFacilitiesUpload).toHaveBeenCalledTimes(1);
  });

  it("enforces the per-slot type allow-list after the ownership gate", async () => {
    mocks.bindingFindFirst.mockResolvedValue({ id: "b-1", applicationId: "app-1", slotKey: "licences" });

    const response = await POST(request({ bindingId: "b-1", idempotencyKey: "k".repeat(20) }));

    expect(response.status).toBe(400);
    expect(mocks.verifyFacilitiesUpload).toHaveBeenCalledTimes(1);
    expect(mocks.storeOwnedFacilitiesFile).not.toHaveBeenCalled();
  });

  it("stores an owned, allowed file", async () => {
    mocks.bindingFindFirst.mockResolvedValue({ id: "b-1", applicationId: "app-1", slotKey: "insurance" });

    const response = await POST(request({ bindingId: "b-1", idempotencyKey: "k".repeat(20) }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ lifecycleStatus: "PASSED", uploadId: "u-1" });
    expect(mocks.storeOwnedFacilitiesFile).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", bindingId: "b-1", fileName: "book.xlsx" }));
  });
});
