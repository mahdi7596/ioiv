import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  refreshFacilitiesEditableSnapshot: vi.fn(),
  loadFacilitiesSubmissionApplication: vi.fn(),
  materializeFacilitiesEvidence: vi.fn(),
  db: {
    $queryRaw: vi.fn(),
    facilitiesAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/facilities/submission", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/facilities/submission")>();
  return {
    ...actual,
    refreshFacilitiesEditableSnapshot: mocks.refreshFacilitiesEditableSnapshot,
    loadFacilitiesSubmissionApplication: mocks.loadFacilitiesSubmissionApplication,
    materializeFacilitiesEvidence: mocks.materializeFacilitiesEvidence,
  };
});

function readyApplication(officers: Array<{ id: string; fullName: string; position: string; isChiefExecutive: boolean }>) {
  const slots = ["questionnaire", "licences", "active-contracts", "insurance", "trial-general", "trial-subsidiary", "credit-company", "credit-ceo", "credit-board", "vat-1404", "tax-1404", "financial-1404"];
  return {
    id: "app_1",
    userId: "user_1",
    companyId: "company_1",
    status: "DRAFT",
    officers,
    fileBindings: slots.map((slotKey) => ({ id: `b-${slotKey}`, slotKey, currentUpload: { lifecycleStatus: "PASSED" } })),
    requestedAmountRial: new Prisma.Decimal(0),
  };
}

describe("saveFacilitiesDraftDetails officer re-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ kind: "user", subjectId: "user_1" });
    mocks.db.$transaction.mockImplementation(async (work: unknown) => (work as (tx: typeof mocks.db) => unknown)(mocks.db));
    mocks.db.$queryRaw.mockResolvedValue([{ id: "app_1" }]);
    mocks.db.facilitiesAuditLog.create.mockResolvedValue({ id: "audit" });
    mocks.materializeFacilitiesEvidence.mockResolvedValue(undefined);
    mocks.refreshFacilitiesEditableSnapshot.mockResolvedValue(undefined);
  });

  it("accepts a board member that only appears after the snapshot is re-synced", async () => {
    const staleOfficers = [{ id: "ceo_1", fullName: "مدیرعامل", position: "مدیرعامل", isChiefExecutive: true }];
    const freshOfficers = [...staleOfficers, { id: "board_new", fullName: "عضو جدید", position: "عضو هیئت‌مدیره", isChiefExecutive: false }];
    // First load (the lock/ownership check) has no board member; second load (after re-sync) does.
    mocks.loadFacilitiesSubmissionApplication
      .mockResolvedValueOnce(readyApplication(staleOfficers))
      .mockResolvedValueOnce(readyApplication(freshOfficers));

    const { saveFacilitiesDraftDetails } = await import("@/lib/actions/facilities-application");
    await expect(saveFacilitiesDraftDetails({ applicationId: "app_1", employeeCount: 5, boardOfficerId: "board_new" })).resolves.toBe(true);

    expect(mocks.refreshFacilitiesEditableSnapshot).toHaveBeenCalledWith(mocks.db, "app_1");
    expect(mocks.loadFacilitiesSubmissionApplication).toHaveBeenCalledTimes(2);
    expect(mocks.materializeFacilitiesEvidence).toHaveBeenCalledOnce();
  });

  it("re-syncs before validating even when the board member is already present", async () => {
    const officers = [
      { id: "ceo_1", fullName: "مدیرعامل", position: "مدیرعامل", isChiefExecutive: true },
      { id: "board_1", fullName: "عضو", position: "عضو هیئت‌مدیره", isChiefExecutive: false },
    ];
    mocks.loadFacilitiesSubmissionApplication.mockResolvedValue(readyApplication(officers));

    const { saveFacilitiesDraftDetails } = await import("@/lib/actions/facilities-application");
    await expect(saveFacilitiesDraftDetails({ applicationId: "app_1", employeeCount: 5, boardOfficerId: "board_1" })).resolves.toBe(true);
    expect(mocks.refreshFacilitiesEditableSnapshot).toHaveBeenCalledOnce();
  });
});
