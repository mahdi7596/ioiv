import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  applicationFindUnique: vi.fn(),
  applicationFileCreate: vi.fn(),
  storeUploadFile: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db", () => ({
  db: {
    application: { findUnique: mocks.applicationFindUnique },
    applicationFile: { create: mocks.applicationFileCreate },
  },
}));
vi.mock("@/lib/uploads/storage", () => ({ storeUploadFile: mocks.storeUploadFile }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { POST } from "@/app/api/uploads/route";

function request(fields: Record<string, string>, file: File | null = new File(["%PDF-"], "doc.pdf", { type: "application/pdf" })) {
  const form = new FormData();
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
});
