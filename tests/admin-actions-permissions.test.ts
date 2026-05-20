import { ApplicationStatus, UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionError } from "@/lib/actions/auth";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  revalidatePath: vi.fn(),
  sendSms: vi.fn(),
  storeUploadFile: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  db: {
    admin: {
      findUnique: vi.fn(),
    },
    application: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    applicationFile: {
      create: vi.fn(),
    },
    statusHistory: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireSession: mocks.requireSession,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/db", () => ({
  db: mocks.db,
}));

vi.mock("@/lib/sms", () => ({
  sendSms: mocks.sendSms,
}));

vi.mock("@/lib/uploads/storage", () => ({
  storeUploadFile: mocks.storeUploadFile,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: mocks.loggerInfo,
    error: mocks.loggerError,
  },
  maskMobile: (mobile: string) => mobile,
}));

function statusFormData(status = ApplicationStatus.UNDER_REVIEW) {
  const formData = new FormData();
  formData.set("applicationId", "app-1");
  formData.set("status", status);
  formData.set("note", "review note");
  return formData;
}

describe("admin action permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ kind: "admin", subjectId: "admin-1" });
    mocks.db.admin.findUnique.mockResolvedValue({
      id: "admin-1",
      active: true,
      role: UserRole.ENTRY_VIEWER,
    });
    mocks.db.application.count.mockResolvedValue(0);
    mocks.db.application.findMany.mockResolvedValue([]);
    mocks.db.application.findUnique.mockResolvedValue({
      id: "app-1",
      mobile: "09123456789",
      status: ApplicationStatus.SUBMITTED,
      adminNote: null,
    });
    mocks.db.application.update.mockReturnValue({ operation: "application.update" });
    mocks.db.statusHistory.create.mockReturnValue({ operation: "statusHistory.create" });
    mocks.db.applicationFile.create.mockResolvedValue({ id: "file-1" });
    mocks.db.$transaction.mockResolvedValue([]);
    mocks.sendSms.mockResolvedValue({ ok: true });
    mocks.storeUploadFile.mockResolvedValue({
      originalName: "certificate.pdf",
      mimeType: "application/pdf",
      size: 10,
      storagePath: "/tmp/certificate.pdf",
    });
  });

  it("allows entry viewers to read admin overview, list, and detail data", async () => {
    const { getAdminOverview, getSubmission, listSubmissions } = await import("@/lib/actions/admin");

    await expect(getAdminOverview()).resolves.toEqual({
      total: 0,
      submitted: 0,
      underReview: 0,
      needsEdit: 0,
      validationCompleted: 0,
    });
    await expect(listSubmissions({ q: "0912", status: "SUBMITTED" })).resolves.toEqual([]);
    await expect(getSubmission("app-1")).resolves.toMatchObject({ id: "app-1" });
  });

  it("rejects entry viewer status changes before loading the application", async () => {
    const { changeSubmissionStatus } = await import("@/lib/actions/admin");

    await expect(changeSubmissionStatus(statusFormData())).rejects.toMatchObject<ActionError>({
      status: 403,
    });
    expect(mocks.db.application.findUnique).not.toHaveBeenCalled();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

  it("rejects entry viewer certificate replacement before loading the application", async () => {
    const { replaceValidationCertificate } = await import("@/lib/actions/admin");
    const formData = new FormData();
    formData.set("applicationId", "app-1");

    await expect(replaceValidationCertificate(formData)).rejects.toMatchObject<ActionError>({
      status: 403,
    });
    expect(mocks.db.application.findUnique).not.toHaveBeenCalled();
    expect(mocks.db.applicationFile.create).not.toHaveBeenCalled();
  });

  it("keeps existing admins able to change status", async () => {
    mocks.db.admin.findUnique.mockResolvedValue({
      id: "admin-1",
      active: true,
      role: UserRole.ADMIN,
    });
    const { changeSubmissionStatus } = await import("@/lib/actions/admin");

    await expect(changeSubmissionStatus(statusFormData())).resolves.toBeUndefined();

    expect(mocks.db.application.update).toHaveBeenCalledWith({
      where: { id: "app-1" },
      data: {
        status: ApplicationStatus.UNDER_REVIEW,
        adminNote: "review note",
      },
    });
    expect(mocks.db.statusHistory.create).toHaveBeenCalledWith({
      data: {
        applicationId: "app-1",
        previousStatus: ApplicationStatus.SUBMITTED,
        newStatus: ApplicationStatus.UNDER_REVIEW,
        changedById: "admin-1",
        note: "review note",
      },
    });
    expect(mocks.db.$transaction).toHaveBeenCalledOnce();
  });

  it("keeps existing admins able to replace validation certificates", async () => {
    mocks.db.admin.findUnique.mockResolvedValue({
      id: "admin-1",
      active: true,
      role: UserRole.SUPER_ADMIN,
    });
    mocks.db.application.findUnique.mockResolvedValue({
      id: "app-1",
      mobile: "09123456789",
      status: ApplicationStatus.VALIDATION_COMPLETED,
    });
    const { replaceValidationCertificate } = await import("@/lib/actions/admin");
    const formData = new FormData();
    formData.set("applicationId", "app-1");
    formData.set("certificate", new File(["pdf"], "certificate.pdf", { type: "application/pdf" }));

    await expect(replaceValidationCertificate(formData)).resolves.toBeUndefined();

    expect(mocks.db.applicationFile.create).toHaveBeenCalledWith({
      data: {
        applicationId: "app-1",
        fieldKey: "validationCertificate",
        originalName: "certificate.pdf",
        mimeType: "application/pdf",
        size: 10,
        storagePath: "/tmp/certificate.pdf",
      },
    });
  });
});
