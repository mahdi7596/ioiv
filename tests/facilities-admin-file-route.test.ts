import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), readReady: vi.fn(), digest: vi.fn(), audit: vi.fn(), info: vi.fn(), warn: vi.fn(),
  db: { admin: { findUnique: vi.fn() }, facilitiesApplication: { findFirst: vi.fn() }, facilitiesFileUpload: { findFirst: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/audit/facilities", () => ({ facilitiesRequestId: () => "00000000-0000-4000-8000-000000000008", writeFacilitiesAudit: mocks.audit }));
vi.mock("@/lib/facilities-files/service", () => ({ bytesMatchStoredDigest: mocks.digest }));
vi.mock("@/lib/facilities-files/storage", () => ({ FilesystemFacilitiesPrivateStorage: class { readReady = mocks.readReady; } }));
vi.mock("@/lib/logger", () => ({ logger: { info: mocks.info, warn: mocks.warn } }));

import { GET } from "@/app/api/admin/facilities/applications/[applicationId]/files/[fileId]/route";

const context = { params: Promise.resolve({ applicationId: "app-1", fileId: "file-1" }) };
const upload = { id: "upload-1", lifecycleStatus: "PASSED", binding: { currentUploadId: "upload-1" }, storedFile: { id: "file-1", storageKey: "ready/00000000-0000-4000-8000-000000000001", originalName: "report.pdf", detectedMimeType: "application/pdf", byteSize: 4, sha256: "a".repeat(64), scanStatus: "PASSED" } };

describe("facilities application-scoped admin file route", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.getSession.mockResolvedValue({ kind: "admin", subjectId: "admin-1" });
    mocks.db.admin.findUnique.mockResolvedValue({ id: "admin-1", active: true, role: "ADMIN" });
    mocks.db.facilitiesApplication.findFirst.mockResolvedValue({ id: "app-1", companyId: "company-1" });
    mocks.db.facilitiesFileUpload.findFirst.mockResolvedValue(upload); mocks.readReady.mockResolvedValue(Buffer.from("file")); mocks.digest.mockReturnValue(true); mocks.audit.mockResolvedValue({ id: "audit-1" });
  });
  it("returns bytes only after a successful audit", async () => {
    const response = await GET(new Request("https://sana.ioiv.ir/api/admin/facilities/applications/app-1/files/file-1"), context);
    expect(response.status).toBe(200); expect(mocks.audit).toHaveBeenCalledOnce(); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("fails closed for entry viewers and mismatched applications", async () => {
    mocks.db.admin.findUnique.mockResolvedValue({ id: "viewer", active: true, role: "ENTRY_VIEWER" });
    expect((await GET(new Request("https://sana.ioiv.ir/x"), context)).status).toBe(404);
    mocks.db.admin.findUnique.mockResolvedValue({ id: "admin-1", active: true, role: "ADMIN" }); mocks.db.facilitiesApplication.findFirst.mockResolvedValue(null);
    expect((await GET(new Request("https://sana.ioiv.ir/x"), context)).status).toBe(404);
  });
  it("returns no file when integrity or audit persistence fails", async () => {
    mocks.digest.mockReturnValue(false); expect((await GET(new Request("https://sana.ioiv.ir/x"), context)).status).toBe(404);
    mocks.digest.mockReturnValue(true); mocks.audit.mockRejectedValue(new Error("db unavailable")); expect((await GET(new Request("https://sana.ioiv.ir/x"), context)).status).toBe(503);
  });
});
