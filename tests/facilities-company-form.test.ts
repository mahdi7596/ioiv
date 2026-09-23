import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("@/lib/actions/facilities-company", () => ({
  saveFacilitiesCompanyDraft: vi.fn(),
  completeFacilitiesCompanyProfile: vi.fn(),
  ensureFacilitiesProfileDocumentSlot: vi.fn(),
}));
import { logger } from "@/lib/logger";
import { ActionError } from "@/lib/actions/auth";
import { saveFacilitiesCompanyDraft, completeFacilitiesCompanyProfile, ensureFacilitiesProfileDocumentSlot } from "@/lib/actions/facilities-company";
import { saveCompanyProfileForm, completeCompanyProfileForm, prepareCompanyProfileUpload } from "@/lib/actions/facilities-company-form";

beforeEach(() => vi.resetAllMocks());
describe("profile form server-action boundary", () => {
  it.each([
    "مجموع درصد سهام باید دقیقاً ۱۰۰ باشد",
    "این مدارک الزامی هنوز بارگذاری و تأیید نشده‌اند",
    "پروفایل تغییر کرده است؛ صفحه را تازه‌سازی کنید",
  ])("returns completion validation as serializable data: %s", async (message) => {
    vi.mocked(completeFacilitiesCompanyProfile).mockRejectedValue(new ActionError(message));
    expect(JSON.parse(JSON.stringify(await completeCompanyProfileForm({ version: 4 })))).toEqual({ ok: false, error: message });
  });
  it("preserves successful saved officer IDs and version", async () => {
    const data = { profileVersion: 4, officers: [{ id: "officer", fullName: "عضو", position: "مدیرعامل" }] };
    vi.mocked(saveFacilitiesCompanyDraft).mockResolvedValue(data);
    expect(await saveCompanyProfileForm({ version: 3 })).toEqual({ ok: true, data });
  });
  it("returns duplicate company and permission errors without throwing", async () => {
    vi.mocked(saveFacilitiesCompanyDraft).mockRejectedValue(new ActionError("این شناسه ملی شرکت قبلاً ثبت شده است"));
    expect(await saveCompanyProfileForm({})).toMatchObject({ ok: false, error: "این شناسه ملی شرکت قبلاً ثبت شده است" });
    vi.mocked(ensureFacilitiesProfileDocumentSlot).mockRejectedValue(new ActionError("دسترسی به این عضو امکان‌پذیر نیست", 403));
    expect(await prepareCompanyProfileUpload("officer", "foreign")).toMatchObject({ ok: false, error: "دسترسی به این عضو امکان‌پذیر نیست" });
  });
  it("handles expired sessions", async () => {
    vi.mocked(completeFacilitiesCompanyProfile).mockRejectedValue(new Error("Unauthorized"));
    expect(await completeCompanyProfileForm({ version: 1 })).toMatchObject({ ok: false, error: "نشست شما منقضی شده است؛ دوباره وارد شوید." });
  });
  it("hides unexpected database details and allows retry", async () => {
    vi.mocked(completeFacilitiesCompanyProfile).mockRejectedValueOnce(new Error("database secret/path" )).mockResolvedValueOnce({ count: 1 });
    const failed = await completeCompanyProfileForm({ version: 1 });
    expect(failed.ok).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith("facilities.profile.action_failed", { action: "complete", reason: "unexpected_failure" });
    expect(JSON.stringify(failed)).not.toContain("secret/path");
    expect(await completeCompanyProfileForm({ version: 1 })).toEqual({ ok: true, data: { count: 1 } });
  });
});
