import { AuditActorType, AuditOutcome, FacilitiesAuditAction } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  findMany: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/admin/facilities-access", () => ({ requireFacilitiesAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ db: { facilitiesAuditLog: { findMany: mocks.findMany } } }));
vi.mock("@/lib/audit/facilities", () => ({
  facilitiesRequestId: () => "00000000-0000-4000-8000-000000000008",
  safeFilterKeys: (value: Record<string, unknown>) => Object.keys(value).filter((key) => value[key]),
  writeFacilitiesAudit: mocks.writeAudit,
}));

import { decodeFacilitiesAuditCursor, listFacilitiesAudit } from "@/lib/actions/facilities-audit";

function row(index: number) {
  return {
    id: `audit_${String(index).padStart(3, "0")}`,
    applicationId: null,
    actorType: AuditActorType.ADMIN,
    actorId: "admin-1",
    action: FacilitiesAuditAction.FILE_DOWNLOADED,
    outcome: AuditOutcome.SUCCEEDED,
    entityType: "StoredFile",
    entityId: `file-${index}`,
    metadata: { recordCount: index, storageKey: "must-not-render" },
    requestId: null,
    ipAddress: "192.168.1.25",
    userAgent: "x".repeat(90),
    createdAt: new Date(Date.UTC(2026, 8, 12, 12, 0, 0, 51 - index)),
  };
}

describe("facilities audit loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "admin-1" });
    mocks.writeAudit.mockResolvedValue({ id: "view-audit" });
  });

  it("requires the super-admin permission, returns 50 rows, and emits a stable cursor", async () => {
    mocks.findMany.mockResolvedValue(Array.from({ length: 51 }, (_, index) => row(index)));
    const result = await listFacilitiesAudit({ action: FacilitiesAuditAction.FILE_DOWNLOADED });

    expect(mocks.requireAdmin).toHaveBeenCalledWith("viewFacilitiesAudit");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 51, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }));
    expect(result.rows).toHaveLength(50);
    expect(result.rows[0].metadata).toEqual({ recordCount: 0 });
    expect(result.rows[0].ipAddress).toBe("192.168.1.xxx");
    expect(result.rows[0].userAgent).toHaveLength(81);
    expect(decodeFacilitiesAuditCursor(result.nextCursor ?? undefined)).toEqual({ createdAt: result.rows[49].createdAt, id: result.rows[49].id });
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: FacilitiesAuditAction.AUDIT_VIEWED, metadata: { filterKeys: ["action"], recordCount: 50 } }));
  });

  it("does not return unaudited results when the view audit write fails", async () => {
    mocks.findMany.mockResolvedValue([row(0)]);
    mocks.writeAudit.mockRejectedValue(new Error("AUDIT_WRITE_FAILED"));
    await expect(listFacilitiesAudit({})).rejects.toThrow("AUDIT_WRITE_FAILED");
  });
});
