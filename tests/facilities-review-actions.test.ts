import { ApplicationStatus, FacilitiesCorrectionSmsStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireFacilitiesAdmin: vi.fn(),
  sendSms: vi.fn(),
  db: {
    facilitiesApplication: { update: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    facilitiesCorrectionRequest: { findUnique: vi.fn(), findFirst: vi.fn(), aggregate: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    facilitiesStatusHistory: { create: vi.fn() },
    facilitiesAuditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/admin/facilities-access", () => ({ requireFacilitiesAdmin: mocks.requireFacilitiesAdmin, getFacilitiesAdminAccess: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/sms", () => ({ sendSms: mocks.sendSms }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() }, maskMobile: () => "0912***0000" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const application = { id: "app_1", status: ApplicationStatus.UNDER_REVIEW };
const correction = {
  id: "correction_1", applicationId: "app_1", sequence: 1, reviewerId: "admin_1", note: "مدارک را اصلاح کنید",
  smsStatus: FacilitiesCorrectionSmsStatus.PENDING, smsAttemptCount: 0, application: { user: { mobile: "09120000000" } },
};

describe("facilities review actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireFacilitiesAdmin.mockResolvedValue({ id: "admin_1", active: true, role: "ADMIN" });
    mocks.db.$transaction.mockImplementation(async (work: (tx: typeof mocks.db) => unknown) => work(mocks.db));
    mocks.db.$queryRaw.mockResolvedValue([{ id: "app_1" }]);
    mocks.db.facilitiesApplication.update.mockResolvedValue(application);
    mocks.db.facilitiesApplication.findUnique.mockResolvedValue(application);
    mocks.db.facilitiesApplication.findUniqueOrThrow.mockResolvedValue(application);
    mocks.db.facilitiesCorrectionRequest.aggregate.mockResolvedValue({ _max: { sequence: null } });
    mocks.db.facilitiesCorrectionRequest.create.mockResolvedValue(correction);
    mocks.db.facilitiesCorrectionRequest.findUnique.mockResolvedValue(correction);
    mocks.db.facilitiesCorrectionRequest.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.facilitiesCorrectionRequest.update.mockResolvedValue(correction);
    mocks.db.facilitiesStatusHistory.create.mockResolvedValue({ id: "history_1" });
    mocks.db.facilitiesAuditLog.create.mockResolvedValue({ id: "audit_1" });
    mocks.sendSms.mockResolvedValue({ ok: true });
  });

  it("commits a correction before sending its one referenced SMS", async () => {
    const { requestFacilitiesCorrection } = await import("@/lib/actions/facilities-review");
    await expect(requestFacilitiesCorrection({ applicationId: "app_1", note: " مدارک را اصلاح کنید " })).resolves.toEqual({ correctionId: "correction_1", smsSent: true });
    expect(mocks.db.facilitiesApplication.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: ApplicationStatus.NEEDS_EDIT } }));
    expect(mocks.sendSms).toHaveBeenCalledWith(expect.objectContaining({ to: "09120000000", clientReferenceId: "correction_1" }));
    expect(mocks.db.facilitiesCorrectionRequest.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ smsStatus: FacilitiesCorrectionSmsStatus.SENT }) }));
  });

  it("keeps the correction active and records safe failure state when SMS fails", async () => {
    mocks.sendSms.mockRejectedValue(new Error("provider secret response"));
    const { requestFacilitiesCorrection } = await import("@/lib/actions/facilities-review");
    await expect(requestFacilitiesCorrection({ applicationId: "app_1", note: "اصلاح لازم است" })).resolves.toMatchObject({ smsSent: false });
    expect(mocks.db.facilitiesApplication.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: ApplicationStatus.NEEDS_EDIT } }));
    expect(mocks.db.facilitiesCorrectionRequest.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ smsStatus: FacilitiesCorrectionSmsStatus.FAILED, smsFailureCode: "PROVIDER_ERROR" }) }));
  });

  it("rejects empty correction notes before changing state", async () => {
    const { requestFacilitiesCorrection } = await import("@/lib/actions/facilities-review");
    await expect(requestFacilitiesCorrection({ applicationId: "app_1", note: "   " })).rejects.toThrow("۱ تا ۲۰۰۰");
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a correction note without Persian text", async () => {
    const { requestFacilitiesCorrection } = await import("@/lib/actions/facilities-review");
    await expect(requestFacilitiesCorrection({ applicationId: "app_1", note: "replace the document" })).rejects.toThrow("فارسی");
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
});
