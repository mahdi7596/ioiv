import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
const state = vi.hoisted(() => ({ tasks: [] as Promise<void>[], push: vi.fn(), refresh: vi.fn(), toast: vi.fn(), forceConflict: false }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  // The conflict flag is the form's only boolean state (initial false).
  useState: (initial: unknown) => [initial === false && state.forceConflict ? true : typeof initial === "function" ? initial() : initial, vi.fn()],
  useTransition: () => [false, (task: () => Promise<void>) => state.tasks.push(task())],
  useEffect: () => undefined,
  useRef: (initial: unknown) => ({ current: initial }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push, refresh: state.refresh }) }));
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
  vi.resetAllMocks(); state.tasks = []; state.forceConflict = false;
  vi.mocked(saveCompanyProfileForm).mockResolvedValue({ ok: true, data: { profileVersion: 2, officers: [] } });
});
it("shows completion validation and stays on the form", async () => {
  vi.mocked(completeCompanyProfileForm).mockResolvedValue({ ok: false, conflict: false, error: "مدارک شرکت را تکمیل کنید" });
  await complete();
  expect(completeCompanyProfileForm).toHaveBeenCalledWith({ version: 2 });
  expect(state.toast).toHaveBeenCalledWith({ type: "error", message: "مدارک شرکت را تکمیل کنید" });
  expect(state.push).not.toHaveBeenCalled();
});
it("does not complete after a failed save", async () => {
  vi.mocked(saveCompanyProfileForm).mockResolvedValue({ ok: false, conflict: false, error: "پروفایل قفل است" });
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
it("turns a stale-version save into a reload prompt instead of a raw error", async () => {
  vi.mocked(saveCompanyProfileForm).mockResolvedValue({ ok: false, conflict: true, error: "پروفایل در جای دیگری تغییر کرده است؛ صفحه را تازه‌سازی کنید" });
  await complete();
  expect(completeCompanyProfileForm).not.toHaveBeenCalled();
  expect(state.toast).toHaveBeenCalledWith({ type: "error", message: "نسخهٔ جدیدتری از پروفایل وجود دارد" });
  expect(state.push).not.toHaveBeenCalled();
});
it("treats a stale-version completion the same way", async () => {
  vi.mocked(completeCompanyProfileForm).mockResolvedValue({ ok: false, conflict: true, error: "پروفایل تغییر کرده است؛ صفحه را تازه‌سازی کنید" });
  await complete();
  expect(state.toast).toHaveBeenCalledWith({ type: "error", message: "نسخهٔ جدیدتری از پروفایل وجود دارد" });
  expect(state.push).not.toHaveBeenCalled();
});
type El = ReactElement<{ children?: ReactNode; className?: string; disabled?: boolean; onClick?: () => void; type?: string }>;
function collect(node: ReactNode, match: (el: El) => boolean, found: El[] = []): El[] {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) { node.forEach((child) => collect(child, match, found)); return found; }
  if (!("props" in node)) return found;
  const el = node as El;
  if (match(el)) found.push(el);
  collect(el.props.children, match, found);
  return found;
}
const text = (node: ReactNode): string => !node || typeof node === "boolean" ? "" : typeof node === "string" || typeof node === "number" ? String(node) : Array.isArray(node) ? node.map(text).join("") : "props" in (node as object) ? text((node as El).props.children) : "";
it("shows a reload prompt and blocks saving while the page is stale", () => {
  state.forceConflict = true;
  const tree = CompanyProfileForm({ initial });
  const [panel] = collect(tree, (el) => typeof el.props.className === "string" && el.props.className.includes("profile-conflict"));
  expect(panel).toBeDefined();
  expect(text(panel)).toContain("اطلاعات این صفحه قدیمی است");
  const [reload] = collect(panel, (el) => el.type === "button");
  expect(text(reload)).toContain("تازه‌سازی صفحه");
  expect(reload.props.type).toBe("button");
  const actions = collect(tree, (el) => el.type === "button" && /ذخیره پیش‌نویس|تأیید تکمیل پروفایل/.test(text(el)));
  expect(actions).toHaveLength(2);
  expect(actions.every((button) => button.props.disabled)).toBe(true);
});
it("renders no conflict prompt normally", () => {
  const tree = CompanyProfileForm({ initial });
  expect(collect(tree, (el) => typeof el.props.className === "string" && el.props.className.includes("profile-conflict"))).toHaveLength(0);
});
