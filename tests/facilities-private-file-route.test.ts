import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { bytesMatchStoredDigest } from "@/lib/facilities-files/service";
import { GET } from "@/app/api/facilities/files/[id]/route";

const storageMocks = vi.hoisted(() => ({ readReady: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  facilitiesProgramConfiguration: { findUnique: vi.fn() },
  facilitiesFileUpload: { findFirst: vi.fn() },
} }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("@/lib/facilities-files/service", () => ({ bytesMatchStoredDigest: vi.fn() }));
vi.mock("@/lib/facilities-files/storage", () => ({
  FilesystemFacilitiesPrivateStorage: class {
    readReady = storageMocks.readReady;
  },
}));

const currentUpload = {
  id: "upload-owner-1",
  lifecycleStatus: "PASSED",
  binding: { userId: "user-1", currentUploadId: "upload-owner-1" },
  storedFile: {
    id: "stored-file-1",
    storageKey: "ready/00000000-0000-4000-8000-000000000001",
    originalName: "private report.pdf",
    detectedMimeType: "application/pdf",
    byteSize: 4,
    sha256: "a".repeat(64),
  },
};

function context(id = "stored-file-1") {
  return { params: Promise.resolve({ id }) };
}

describe("facilities private file download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({ kind: "user", subjectId: "user-1" });
    vi.mocked(db.facilitiesProgramConfiguration.findUnique).mockResolvedValue({ program: "FACILITIES", isEnabled: true } as never);
    vi.mocked(db.facilitiesFileUpload.findFirst).mockResolvedValue(currentUpload as never);
    storageMocks.readReady.mockResolvedValue(Buffer.from("file"));
    vi.mocked(bytesMatchStoredDigest).mockReturnValue(true);
  });

  it("requires a session before looking up a facilities file", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const response = await GET(new Request("http://test.local/api/facilities/files/stored-file-1"), context());
    expect(response.status).toBe(401);
    expect(db.facilitiesFileUpload.findFirst).not.toHaveBeenCalled();
  });

  it("does not expose a file to another owner", async () => {
    vi.mocked(db.facilitiesFileUpload.findFirst).mockResolvedValue(null);
    const response = await GET(new Request("http://test.local/api/facilities/files/stored-file-1"), context());
    expect(response.status).toBe(404);
    expect(storageMocks.readReady).not.toHaveBeenCalled();
  });

  it("allows an owner to access private M3 profile evidence while the programme is disabled", async () => {
    vi.mocked(db.facilitiesProgramConfiguration.findUnique).mockResolvedValue(null);
    const response = await GET(new Request("http://test.local/api/facilities/files/stored-file-1"), context());
    expect(response.status).toBe(200);
  });

  it("rejects admins until the facilities reviewer permission is approved", async () => {
    vi.mocked(getSession).mockResolvedValue({ kind: "admin", subjectId: "admin-1" });
    const response = await GET(new Request("http://test.local/api/facilities/files/stored-file-1"), context());
    expect(response.status).toBe(403);
    expect(db.facilitiesFileUpload.findFirst).not.toHaveBeenCalled();
  });

  it("serves only the current, passed owner file with private safe headers", async () => {
    const response = await GET(new Request("http://test.local/api/facilities/files/stored-file-1"), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    expect(response.headers.get("Content-Disposition")).not.toContain("ready/");
  });

  it("fails closed when private bytes do not match stored metadata", async () => {
    vi.mocked(bytesMatchStoredDigest).mockReturnValue(false);
    const response = await GET(new Request("http://test.local/api/facilities/files/stored-file-1"), context());
    expect(response.status).toBe(404);
  });
});
