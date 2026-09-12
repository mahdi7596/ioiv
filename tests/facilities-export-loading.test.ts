import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applicationCount: vi.fn(),
  applicationFindMany: vi.fn(),
  shareholderCount: vi.fn(),
  officerCount: vi.fn(),
  evidenceCount: vi.fn(),
  bindingCount: vi.fn(),
  paymentCount: vi.fn(),
  correctionCount: vi.fn(),
  historyCount: vi.fn(),
  bindingGroupBy: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {
  facilitiesApplication: { count: mocks.applicationCount, findMany: mocks.applicationFindMany },
  facilitiesApplicationShareholder: { count: mocks.shareholderCount },
  facilitiesApplicationOfficer: { count: mocks.officerCount },
  facilitiesApplicationEvidence: { count: mocks.evidenceCount },
  facilitiesFileBinding: { count: mocks.bindingCount, groupBy: mocks.bindingGroupBy },
  facilitiesPaymentAttempt: { count: mocks.paymentCount },
  facilitiesCorrectionRequest: { count: mocks.correctionCount },
  facilitiesStatusHistory: { count: mocks.historyCount },
} }));

import { FacilitiesExportError, loadFacilitiesExportApplications } from "@/lib/export/facilities";

describe("facilities export loading bounds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const mock of [mocks.shareholderCount, mocks.officerCount, mocks.evidenceCount, mocks.bindingCount, mocks.paymentCount, mocks.correctionCount, mocks.historyCount]) mock.mockResolvedValue(0);
    mocks.bindingGroupBy.mockResolvedValue([]);
  });

  it("rejects more than 5,000 applications before reading identifiers or workbook data", async () => {
    mocks.applicationCount.mockResolvedValue(5_001);
    await expect(loadFacilitiesExportApplications({ status: "SUBMITTED" })).rejects.toMatchObject({ status: 422 } satisfies Partial<FacilitiesExportError>);
    expect(mocks.applicationFindMany).not.toHaveBeenCalled();
  });

  it("preflights related rows before loading detailed application graphs", async () => {
    mocks.applicationCount.mockResolvedValue(1);
    mocks.applicationFindMany.mockResolvedValueOnce([{ id: "application-1", companyId: "company-1" }]);
    mocks.shareholderCount.mockResolvedValue(100_000);

    await expect(loadFacilitiesExportApplications({ intakeId: "intake-1", supplierId: "supplier-1", from: "2026-09-12", to: "2026-09-12" })).rejects.toMatchObject({ status: 422 } satisfies Partial<FacilitiesExportError>);
    expect(mocks.applicationFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.applicationFindMany.mock.calls[0][0].where).toMatchObject({
      intakeId: "intake-1",
      intakeSupplier: { supplierId: "supplier-1" },
      createdAt: { gte: new Date("2026-09-11T20:30:00.000Z"), lt: new Date("2026-09-12T20:30:00.000Z") },
    });
  });
});
