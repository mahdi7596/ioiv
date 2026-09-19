import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  applicationFindUnique: vi.fn(),
  applicationFileCreate: vi.fn(),
  applicationFileFindMany: vi.fn(),
  applicationFileDeleteMany: vi.fn(),
  storeUploadFile: vi.fn(),
  unlink: vi.fn(),
  commit: vi.fn(),
  cleanup: vi.fn(),
}));

vi.mock("@/lib/uploads/candidates", () => ({ stageLegacyUpload: mocks.storeUploadFile }));
vi.mock("@/lib/uploads/replace", () => ({ cleanupLegacyReplacements: mocks.cleanup }));
vi.mock("@/lib/uploads/coordination", async original => ({ ...await original<typeof import("@/lib/uploads/coordination")>(), commitApplicantUpload: mocks.commit }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db", () => ({
  db: {
    application: { findUnique: mocks.applicationFindUnique },
    applicationFile: { create: mocks.applicationFileCreate, findMany: mocks.applicationFileFindMany, deleteMany: mocks.applicationFileDeleteMany },
  },
}));
vi.mock("@/lib/uploads/storage", () => ({ storeUploadFile: mocks.storeUploadFile, UPLOAD_MALWARE_MESSAGE: "malware", UPLOAD_SCAN_UNAVAILABLE_MESSAGE: "scan-unavailable" }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { POST } from "@/app/api/uploads/route";

function request(fields: Record<string, string>, file: File | null = new File(["%PDF-"], "doc.pdf", { type: "application/pdf" })) {
  const form = new FormData();
  form.set("generation", "0");
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  if (file) form.set("file", file);
  return new Request("http://test.local/api/uploads", { method: "POST", body: form });
}

describe("legacy upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ kind: "user", subjectId: "user-1" });
    mocks.applicationFindUnique.mockResolvedValue({ id: "app-1", userId: "user-1", status: "DRAFT" });
    mocks.storeUploadFile.mockResolvedValue({ originalName: "doc.pdf", mimeType: "application/pdf", size: 5, storagePath: "/uploads/app-1/creditReports.ceo/x.pdf" });
    mocks.applicationFileCreate.mockResolvedValue({ id: "file-1", originalName: "doc.pdf", fieldKey: "creditReports.ceo", size: 5, mimeType: "application/pdf" });
    mocks.applicationFileFindMany.mockResolvedValue([]);
    mocks.applicationFileDeleteMany.mockResolvedValue({ count: 0 });
    mocks.unlink.mockResolvedValue(undefined);
    mocks.commit.mockResolvedValue({ fileId: "file-1", name: "doc.pdf", fieldKey: "creditReports.ceo", generation: 1, draftVersion: 1 });
    mocks.cleanup.mockResolvedValue(undefined);
  });

  it("rejects an oversized declared body before parsing or touching the database", async () => {
    const form = new FormData();
    form.set("applicationId", "app-1");
    form.set("fieldKey", "creditReports.ceo");
    form.set("file", new File(["%PDF-"], "doc.pdf"));
    const response = await POST(new Request("http://test.local/api/uploads", { method: "POST", body: form, headers: { "content-length": String(30 * 1024 * 1024) } }));

    expect(response.status).toBe(413);
    expect(mocks.applicationFindUnique).not.toHaveBeenCalled();
    expect(mocks.storeUploadFile).not.toHaveBeenCalled();
  });

  it("rejects a traversal field key before touching the database", async () => {
    const response = await POST(request({ applicationId: "app-1", fieldKey: "../../../app/public" }));

    expect(response.status).toBe(400);
    expect(mocks.applicationFindUnique).not.toHaveBeenCalled();
    expect(mocks.storeUploadFile).not.toHaveBeenCalled();
  });

  it("rejects field keys outside the wizard allow-list", async () => {
    const response = await POST(request({ applicationId: "app-1", fieldKey: "validationCertificate" }));

    expect(response.status).toBe(400);
    expect(mocks.applicationFindUnique).not.toHaveBeenCalled();
  });

  it("rejects application ids that are not a single safe path segment", async () => {
    const response = await POST(request({ applicationId: "app/../other", fieldKey: "creditReports.ceo" }));

    expect(response.status).toBe(400);
    expect(mocks.applicationFindUnique).not.toHaveBeenCalled();
  });

  it("rejects uploads to another user's application", async () => {
    mocks.applicationFindUnique.mockResolvedValue({ id: "app-1", userId: "user-2", status: "DRAFT" });

    const response = await POST(request({ applicationId: "app-1", fieldKey: "creditReports.ceo" }));

    expect(response.status).toBe(403);
    expect(mocks.storeUploadFile).not.toHaveBeenCalled();
  });

  it("stores an allow-listed field key for the owning user", async () => {
    const response = await POST(request({ applicationId: "app-1", fieldKey: "taxDeclarations.2.file" }));

    expect(response.status).toBe(200);
    expect(mocks.storeUploadFile).toHaveBeenCalledWith(expect.objectContaining({ applicationId: "app-1", fieldKey: "taxDeclarations.2.file" }));
    await expect(response.json()).resolves.toMatchObject({ fileId: "file-1" });
  });

  it("preserves committed success when durable cleanup must retry", async () => {
    mocks.cleanup.mockRejectedValueOnce(new Error("synthetic cleanup unavailable"));
    const response = await POST(request({ applicationId: "app-1", fieldKey: "creditReports.ceo" }));
    expect(response.status).toBe(200);
    expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({ expectedGeneration: 0 }));
    expect(mocks.applicationFileDeleteMany).not.toHaveBeenCalled();
  });

  it("maps scanner outcomes to 422 and 503", async () => {
    mocks.storeUploadFile.mockRejectedValueOnce(new Error("malware"));
    expect((await POST(request({ applicationId: "app-1", fieldKey: "creditReports.ceo" }))).status).toBe(422);

    mocks.storeUploadFile.mockRejectedValueOnce(new Error("scan-unavailable"));
    expect((await POST(request({ applicationId: "app-1", fieldKey: "creditReports.ceo" }))).status).toBe(503);
    expect(mocks.applicationFileCreate).not.toHaveBeenCalled();
  });
});
