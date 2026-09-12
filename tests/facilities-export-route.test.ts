import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), load: vi.fn(), xlsx: vi.fn(), audit: vi.fn(), info: vi.fn(), error: vi.fn(),
  db: { admin: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/audit/facilities", () => ({ facilitiesRequestId: () => "00000000-0000-4000-8000-000000000008", safeFilterKeys: () => ["status"], writeFacilitiesAudit: mocks.audit }));
vi.mock("@/lib/export/facilities", async (importOriginal) => { const actual = await importOriginal<typeof import("@/lib/export/facilities")>(); return { ...actual, loadFacilitiesExportApplications: mocks.load, createFacilitiesXlsx: mocks.xlsx }; });
vi.mock("@/lib/logger", () => ({ logger: { info: mocks.info, error: mocks.error } }));

import { GET } from "@/app/api/admin/facilities/export/route";

describe("facilities export route", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getSession.mockResolvedValue({ kind: "admin", subjectId: "admin-1" }); mocks.db.admin.findUnique.mockResolvedValue({ id: "admin-1", active: true, role: "ADMIN" }); mocks.load.mockResolvedValue({ applications: [], relatedRows: 0 }); mocks.xlsx.mockReturnValue(Buffer.from("xlsx")); mocks.audit.mockResolvedValue({ id: "audit" }); });
  it("allows full admins and audits before returning XLSX", async () => { const response = await GET(new Request("https://sana.ioiv.ir/api/admin/facilities/export?status=SUBMITTED")); expect(response.status).toBe(200); expect(mocks.audit).toHaveBeenCalledOnce(); expect(response.headers.get("Content-Type")).toContain("spreadsheetml"); });
  it("denies entry viewers before loading data", async () => { mocks.db.admin.findUnique.mockResolvedValue({ id: "viewer", active: true, role: "ENTRY_VIEWER" }); const response = await GET(new Request("https://sana.ioiv.ir/api/admin/facilities/export")); expect(response.status).toBe(403); expect(mocks.load).not.toHaveBeenCalled(); });
  it("returns no workbook when success auditing fails", async () => { mocks.audit.mockRejectedValue(new Error("audit unavailable")); const response = await GET(new Request("https://sana.ioiv.ir/api/admin/facilities/export")); expect(response.status).toBe(500); expect(await response.json()).toEqual({ error: "ساخت خروجی ناموفق بود؛ دوباره تلاش کنید" }); });
});
