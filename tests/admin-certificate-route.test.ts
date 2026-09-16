import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ replaceValidationCertificate: vi.fn(), requireActiveAdmin: vi.fn(), loggerError: vi.fn() }));

vi.mock("@/lib/actions/admin", () => ({ replaceValidationCertificate: mocks.replaceValidationCertificate }));
vi.mock("@/lib/admin/require-admin", () => ({ requireActiveAdmin: mocks.requireActiveAdmin }));
vi.mock("@/lib/actions/auth", () => ({
  ActionError: class ActionError extends Error {
    status: number;
    constructor(message: string, status = 400) { super(message); this.status = status; }
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.loggerError } }));

function request() {
  const formData = new FormData();
  formData.set("applicationId", "app_1");
  formData.set("certificate", new File(["%PDF-"], "certificate.pdf", { type: "application/pdf" }));
  return new Request("https://sana.ioiv.ir/api/admin/submissions/certificate", { method: "POST", body: formData });
}

describe("admin certificate replace route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("authenticates before reading the body and never reaches the action when denied", async () => {
    const { ActionError } = await import("@/lib/actions/auth");
    const { POST } = await import("@/app/api/admin/submissions/certificate/route");
    mocks.requireActiveAdmin.mockRejectedValueOnce(new ActionError("Unauthorized", 401));

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.requireActiveAdmin).toHaveBeenCalledWith("manageValidationCertificates");
    expect(mocks.replaceValidationCertificate).not.toHaveBeenCalled();
  });

  it("forwards the multipart form to the action and reports success", async () => {
    const { POST } = await import("@/app/api/admin/submissions/certificate/route");
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    const form = mocks.replaceValidationCertificate.mock.calls[0][0] as FormData;
    expect(form.get("applicationId")).toBe("app_1");
    expect(form.get("certificate")).toBeInstanceOf(File);
  });

  it("maps action errors to their status and hides unexpected errors", async () => {
    const { ActionError } = await import("@/lib/actions/auth");
    const { POST } = await import("@/app/api/admin/submissions/certificate/route");

    mocks.replaceValidationCertificate.mockRejectedValueOnce(new ActionError("پرونده پیدا نشد", 404));
    expect((await POST(request())).status).toBe(404);

    mocks.replaceValidationCertificate.mockRejectedValueOnce(new Error("ENOENT /app/uploads/x"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "خطای غیرمنتظره رخ داد" });
    expect(mocks.loggerError).toHaveBeenCalledOnce();
  });
});
