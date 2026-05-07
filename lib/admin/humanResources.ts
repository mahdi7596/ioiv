import { normalizeLocalizedDigits } from "@/lib/input/digits";

export const humanResourcesEmployeeCountLabel =
  "تعداد نیروی انسانی بر اساس آخرین لیست بیمه";

export function formatEmployeeCount(value: unknown) {
  if (!value || typeof value !== "object") return "-";

  const employeeCount = (value as { employeeCount?: unknown }).employeeCount;
  const count = parseEmployeeCount(employeeCount);

  return count ? count.toLocaleString("fa-IR") : "-";
}

function parseEmployeeCount(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = normalizeLocalizedDigits(value).trim();

  if (!/^\d+$/.test(normalized)) {
    return undefined;
  }

  const count = Number(normalized);
  return Number.isFinite(count) && count > 0 ? count : undefined;
}
