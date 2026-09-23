import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
const state = vi.hoisted(() => ({ tasks: [] as Promise<void>[], push: vi.fn(), toast: vi.fn() }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, vi.fn()],
  useTransition: () => [false, (task: () => Promise<void>) => state.tasks.push(task())],
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("@/components/ui/toast", () => ({ showToast: state.toast }));
vi.mock("@/lib/actions/facilities-company-form", () => ({ saveCompanyProfileForm: vi.fn(), completeCompanyProfileForm: vi.fn(), prepareCompanyProfileUpload: vi.fn() }));
import { saveCompanyProfileForm, completeCompanyProfileForm } from "@/lib/actions/facilities-company-form";
import { CompanyProfileForm } from "@/components/facilities/CompanyProfileForm";
const initial = {
  version: 1, name: "شرکت", nationalId: "12345678901", registrationNumber: "123", registrationPlace: "تهران", registrationDate: "2020-01-01", registeredCapitalRial: "1000", contactFullName: "رابط", contactMobile: "09123456789",
  shareholders: [{ fullName: "سهام‌دار", nationalId: "1234567890", ownershipPercentage: "100" }],
  officers: [{ id: "ceo", fullName: "مدیر", position: "مدیرعامل" }, { id: "board", fullName: "عضو", position: "عضو هیئت‌مدیره" }],
};
function findButton(node: ReactNode): ReactElement<{ onClick: () => void }> | undefined {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.map(findButton).find(Boolean);
  if (!("props" in node)) return;
  const el = node as ReactElement<{ children?: ReactNode; onClick: () => void }>;
  if (el.type === "button" && String(el.props.children).includes("تأیید تکمیل پروفایل")) return el;
  return findButton(el.props.children);
}
async function complete() {
  const button = findButton(CompanyProfileForm({ initial }));
  expect(button).toBeDefined();
  button!.props.onClick();
  await Promise.all(state.tasks);
}
beforeEach(() => {
  vi.resetAllMocks(); state.tasks = [];
  vi.mocked(saveCompanyProfileForm).mockResolvedValue({ ok: true, data: { profileVersion: 2, officers: [] } });
});
it("shows completion validation and stays on the form", async () => {
  vi.mocked(completeCompanyProfileForm).mockResolvedValue({ ok: false, error: "مدارک شرکت را تکمیل کنید" });
  await complete();
  expect(completeCompanyProfileForm).toHaveBeenCalledWith({ version: 2 });
  expect(state.toast).toHaveBeenCalledWith({ type: "error", message: "مدارک شرکت را تکمیل کنید" });
  expect(state.push).not.toHaveBeenCalled();
});
it("does not complete after a failed save", async () => {
  vi.mocked(saveCompanyProfileForm).mockResolvedValue({ ok: false, error: "پروفایل قفل است" });
  await complete();
  expect(completeCompanyProfileForm).not.toHaveBeenCalled();
  expect(state.push).not.toHaveBeenCalled();
});
it("hides transport/framework errors", async () => {
  vi.mocked(completeCompanyProfileForm).mockRejectedValue(new Error("Minified React error #441"));
  await complete();
  expect(state.toast).toHaveBeenCalledWith({ type: "error", message: "ارتباط با سرور برقرار نشد؛ اتصال اینترنت را بررسی و دوباره تلاش کنید." });
  expect(state.push).not.toHaveBeenCalled();
});
it("navigates after successful completion", async () => {
  vi.mocked(completeCompanyProfileForm).mockResolvedValue({ ok: true, data: { count: 1 } });
  await complete();
  expect(state.push).toHaveBeenCalledWith("/dashboard");
});
