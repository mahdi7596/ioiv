import { z } from "zod";

const CEO_POSITION = "مدیرعامل";

export function normalizeDigits(value: string) {
  return value.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

export function normalizedText(value: string) {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
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
  contactNationalCode: z.string().transform(normalizeDigits).refine((value) => /^\d{10}$/.test(value), "کد ملی رابط باید ۱۰ رقم باشد"),
  shareholders: z.array(z.object({ id: z.string().optional(), fullName: text("نام سهام‌دار"), ownershipPercentage: decimal.refine((v) => Number(v) > 0 && Number(v) <= 100, "درصد سهام باید بیشتر از صفر و حداکثر ۱۰۰ باشد") })).max(100),
  officers: z.array(z.object({ id: z.string().optional(), fullName: text("نام عضو هیئت‌مدیره"), position: text("سمت", 80) })).max(100),
});

export { CEO_POSITION };
