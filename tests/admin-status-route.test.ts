import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  changeSubmissionStatus: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/actions/admin", () => ({
  changeSubmissionStatus: mocks.changeSubmissionStatus,
}));

vi.mock("@/lib/actions/auth", () => ({
  ActionError: class ActionError extends Error {
    status: number;

    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

describe("admin status API route", () => {
  it("accepts normal form data without requiring a Next server action payload", async () => {
    const { POST } = await import("@/app/api/admin/submissions/status/route");
    const formData = new FormData();
    formData.set("applicationId", "app_1");
    formData.set("status", "NEEDS_EDIT");
    formData.set("note", "فلان تغییرو باید انجام بدی");

    const response = await POST(
      new Request("https://sana.ioiv.ir/api/admin/submissions/status", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.changeSubmissionStatus).toHaveBeenCalledWith(expect.any(FormData));
    const submittedForm = mocks.changeSubmissionStatus.mock.calls[0][0] as FormData;
    expect(submittedForm.get("status")).toBe("NEEDS_EDIT");
    expect(submittedForm.get("note")).toBe("فلان تغییرو باید انجام بدی");
  });
});
