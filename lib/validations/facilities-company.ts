import { z } from "zod";

const CEO_POSITION = "مدیرعامل";
// A member can hold both roles at once; this title still counts as the single CEO.
const CEO_CHAIR_POSITION = "مدیرعامل و رئیس هیئت‌مدیره";

export function normalizeDigits(value: string) {
  return value.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

export function normalizedText(value: string) {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

// The CEO can be titled either «مدیرعامل» or the combined «مدیرعامل و رئیس هیئت‌مدیره».
// Both map to isChiefExecutive and count toward the single-CEO invariant.
export function isCeoRole(position: string | null | undefined) {
  const role = normalizedText(position ?? "");
  return role === CEO_POSITION || role === CEO_CHAIR_POSITION;
}

const text = (label: string, max = 160) => z.string().transform(normalizedText).refine(Boolean, `${label} الزامی است`).refine((value) => value.length <= max, `${label} طولانی است`);
const decimal = z.string().transform(normalizeDigits).refine((value) => /^\d+(?:\.\d{1,6})?$/.test(value), "عدد اعشاری معتبر نیست");

export const companyDraftSchema = z.object({
  version: z.number().int().min(0).optional(),
  name: text("نام شرکت"),
  nationalId: z.string().transform(normalizeDigits).refine((value) => /^\d{11}$/.test(value), "شناسه ملی شرکت باید ۱۱ رقم باشد"),
  registrationNumber: text("شماره ثبت", 80),
  registrationPlace: text("محل ثبت", 120),
  registrationDate: z.string().refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), "تاریخ ثبت معتبر نیست"),
  registeredCapitalRial: decimal.refine((value) => /^([1-9]\d*)(?:\.0+)?$/.test(value), "سرمایه باید عدد صحیح مثبت به ریال باشد"),
  contactFullName: text("نام و نام خانوادگی رابط"),
  contactMobile: z.string().transform(normalizeDigits).refine((value) => /^09\d{9}$/.test(value), "شماره همراه رابط باید با ۰۹ شروع شود و ۱۱ رقم باشد"),
  shareholders: z.array(z.object({
    id: z.string().optional(),
    fullName: text("مشخصات شخص حقیقی یا حقوقی"),
    nationalId: z.string().transform(normalizeDigits).refine((value) => /^\d{10}$|^\d{11}$/.test(value), "کد ملی (۱۰ رقم) یا شناسه ملی (۱۱ رقم) معتبر نیست"),
    ownershipPercentage: decimal.refine((v) => Number(v) > 0 && Number(v) <= 100, "درصد سهام باید بیشتر از صفر و حداکثر ۱۰۰ باشد"),
  })).max(100),
  officers: z.array(z.object({ id: z.string().optional(), fullName: text("نام عضو هیئت‌مدیره"), position: text("سمت", 80) })).max(100),
});

export { CEO_POSITION, CEO_CHAIR_POSITION };
