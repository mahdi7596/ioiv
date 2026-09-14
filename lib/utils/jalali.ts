import { isValidJalaaliDate, jalaaliMonthLength, toGregorian, toJalaali } from "jalaali-js";

export const PERSIAN_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function toPersianDigits(input: number | string): string {
  return String(input).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

export type JalaliDate = { jy: number; jm: number; jd: number };

export function isoToJalali(iso: string): JalaliDate | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [gy, gm, gd] = iso.split("-").map(Number);
  return toJalaali(gy, gm, gd);
}

export function jalaliToIso(jy: number, jm: number, jd: number): string | null {
  if (!isValidJalaaliDate(jy, jm, jd)) return null;
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return `${String(gy).padStart(4, "0")}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

export function jalaliMonthDays(jy: number, jm: number): number {
  return jalaaliMonthLength(jy, jm);
}

export function jalaliWeekday(jy: number, jm: number, jd: number): number {
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  const jsWeekday = new Date(gy, gm - 1, gd).getDay();
  return (jsWeekday + 1) % 7;
}

export function currentJalaliYear(): number {
  const now = new Date();
  return toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate()).jy;
}

export function jalaliYearRange(fromYear = 1290): number[] {
  const current = currentJalaliYear();
  const years: number[] = [];
  for (let year = current; year >= fromYear; year--) years.push(year);
  return years;
}
