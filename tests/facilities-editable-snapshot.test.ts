import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { refreshFacilitiesEditableSnapshot } from "@/lib/facilities/submission";

function officerTx(overrides: {
  status?: string;
  companyOfficers?: Array<{ id: string; fullName: string; position: string; isChiefExecutive: boolean }>;
  companyShareholders?: Array<{ fullName: string; ownershipPercentage: Prisma.Decimal }>;
  existingSnapshotOfficers?: Array<{ id: string; sourceCompanyOfficerId: string | null; fullName: string; position: string; isChiefExecutive: boolean }>;
} = {}) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
    facilitiesApplication: {
      findUnique: vi.fn().mockResolvedValue({ companyId: "company_1", status: overrides.status ?? "DRAFT" }),
    },
    company: {
      findUnique: vi.fn().mockResolvedValue({
        name: "شرکت نمونه",
        nationalId: "۱۲۳۴۵۶۷۸۹۰۱",
        registrationNumber: "۱۲۳",
        registrationPlace: "تهران",
        registrationDate: new Date(),
        registeredCapitalRial: new Prisma.Decimal(100),
        contactFullName: "نماینده",
        contactNationalCode: "۱۲۳۴۵۶۷۸۹۰",
        shareholders: overrides.companyShareholders ?? [{ fullName: "سهامدار", ownershipPercentage: new Prisma.Decimal(100) }],
        officers: overrides.companyOfficers ?? [
          { id: "ceo_1", fullName: "مدیرعامل", position: "مدیرعامل", isChiefExecutive: true },
        ],
      }),
    },
    facilitiesApplicationCompanySnapshot: { update: vi.fn().mockResolvedValue({}) },
    facilitiesApplicationShareholder: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) },
    facilitiesApplicationOfficer: {
      findMany: vi.fn().mockResolvedValue(overrides.existingSnapshotOfficers ?? [{ id: "snap_ceo", sourceCompanyOfficerId: "ceo_1", fullName: "مدیرعامل", position: "مدیرعامل", isChiefExecutive: true }]),
      update: vi.fn().mockImplementation(({ where }) => Promise.resolve({ id: where.id })),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: `snap_${data.sourceCompanyOfficerId}` })),
      deleteMany: vi.fn().mockResolvedValue({}),
    },
  };
  return tx;
}

describe("refreshFacilitiesEditableSnapshot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("no-ops for non-editable applications", async () => {
    const tx = officerTx({ status: "SUBMITTED" });
    await refreshFacilitiesEditableSnapshot(tx as never, "app_1");
    expect(tx.company.findUnique).not.toHaveBeenCalled();
    expect(tx.facilitiesApplicationOfficer.create).not.toHaveBeenCalled();
    expect(tx.facilitiesApplicationCompanySnapshot.update).not.toHaveBeenCalled();
  });

  it("runs for NEEDS_EDIT applications", async () => {
    const tx = officerTx({ status: "NEEDS_EDIT" });
    await refreshFacilitiesEditableSnapshot(tx as never, "app_1");
    expect(tx.company.findUnique).toHaveBeenCalledOnce();
  });

  it("creates snapshot rows for board members added after the draft was created", async () => {
    const tx = officerTx({
      existingSnapshotOfficers: [{ id: "snap_ceo", sourceCompanyOfficerId: "ceo_1", fullName: "مدیرعامل", position: "مدیرعامل", isChiefExecutive: true }],
      companyOfficers: [
        { id: "ceo_1", fullName: "مدیرعامل", position: "مدیرعامل", isChiefExecutive: true },
        { id: "board_new", fullName: "عضو جدید", position: "عضو هیئت‌مدیره", isChiefExecutive: false },
      ],
    });
    await refreshFacilitiesEditableSnapshot(tx as never, "app_1");
    expect(tx.facilitiesApplicationOfficer.create).toHaveBeenCalledWith({
      data: { applicationId: "app_1", sourceCompanyOfficerId: "board_new", fullName: "عضو جدید", position: "عضو هیئت‌مدیره", isChiefExecutive: false },
    });
    // Existing CEO row is matched by sourceCompanyOfficerId and updated rather than duplicated.
    expect(tx.facilitiesApplicationOfficer.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "snap_ceo" } }));
  });

  it("never gates on profile-document completeness", async () => {
    // company has no facilitiesFileBindings and no profileCompletedAt — the heavy refresh would throw here.
    const tx = officerTx();
    await expect(refreshFacilitiesEditableSnapshot(tx as never, "app_1")).resolves.toBeUndefined();
    expect(tx.facilitiesApplicationCompanySnapshot.update).toHaveBeenCalledOnce();
  });

  it("preserves credit-report-referenced officers when pruning stale snapshot rows", async () => {
    const tx = officerTx();
    await refreshFacilitiesEditableSnapshot(tx as never, "app_1");
    expect(tx.$executeRaw).toHaveBeenCalledWith(expect.arrayContaining([expect.stringContaining("prune_editable_facilities_officers")]), "app_1", ["snap_ceo"]);
    expect(tx.facilitiesApplicationOfficer.deleteMany).not.toHaveBeenCalled();
  });
});
