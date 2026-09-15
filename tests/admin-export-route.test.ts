import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  createSubmissionsCsv: vi.fn(),
  createSubmissionsXlsx: vi.fn(),
  getSubmissionExportRows: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  db: {
    admin: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: mocks.getSession,
}));

vi.mock("@/lib/db", () => ({
  db: mocks.db,
}));

vi.mock("@/lib/export/submissions", () => ({
  SubmissionExportError: class SubmissionExportError extends Error {
    constructor(message: string, public readonly status: 422) { super(message); }
  },
  createSubmissionsCsv: mocks.createSubmissionsCsv,
  createSubmissionsXlsx: mocks.createSubmissionsXlsx,
  getSubmissionExportRows: mocks.getSubmissionExportRows,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: vi.fn(),
    error: mocks.loggerError,
  },
}));

describe("admin export route permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ kind: "admin", subjectId: "admin-1" });
    mocks.db.admin.findUnique.mockResolvedValue({
      id: "admin-1",
      active: true,
      role: UserRole.ADMIN,
    });
    mocks.getSubmissionExportRows.mockResolvedValue([{ "نام شرکت": "شرکت آزمون" }]);
    mocks.createSubmissionsCsv.mockReturnValue("csv");
    mocks.createSubmissionsXlsx.mockReturnValue(Buffer.from("xlsx"));
  });

  it("rejects entry viewer exports without creating a file", async () => {
    mocks.db.admin.findUnique.mockResolvedValue({
      id: "admin-1",
      active: true,
      role: UserRole.ENTRY_VIEWER,
    });
    const { GET } = await import("@/app/api/admin/export/route");

    const response = await GET(new Request("https://sana.ioiv.ir/api/admin/export?format=xlsx"));

    expect(response.status).toBe(403);
    expect(mocks.getSubmissionExportRows).not.toHaveBeenCalled();
    expect(mocks.createSubmissionsXlsx).not.toHaveBeenCalled();
  });

  it("keeps existing admins able to export", async () => {
    const { GET } = await import("@/app/api/admin/export/route");

    const response = await GET(new Request("https://sana.ioiv.ir/api/admin/export?format=csv"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("submissions.csv");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(mocks.getSubmissionExportRows).toHaveBeenCalledOnce();
    expect(mocks.createSubmissionsCsv).toHaveBeenCalledOnce();
  });

  it("returns 422 with the message when the export exceeds the row cap", async () => {
    const { SubmissionExportError } = await import("@/lib/export/submissions");
    mocks.getSubmissionExportRows.mockRejectedValue(new SubmissionExportError("تعداد پرونده‌ها بیش از حد مجاز است", 422));
    const { GET } = await import("@/app/api/admin/export/route");

    const response = await GET(new Request("https://sana.ioiv.ir/api/admin/export?format=xlsx"));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "تعداد پرونده‌ها بیش از حد مجاز است" });
    expect(mocks.createSubmissionsXlsx).not.toHaveBeenCalled();
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });
});
