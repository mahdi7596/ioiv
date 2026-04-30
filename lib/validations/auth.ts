import { z } from "zod";
import { keepAsciiDigits } from "@/lib/input/digits";

export const mobileSchema = z
  .string()
  .transform(keepAsciiDigits)
  .pipe(z.string().regex(/^09\d{9}$/, "شماره موبایل معتبر نیست"));

export const otpSchema = z
  .string()
  .transform(keepAsciiDigits)
  .pipe(z.string().regex(/^\d{4}$/, "کد تایید باید ۴ رقم باشد"));

export const companyNationalIdSchema = z
  .string()
  .transform(keepAsciiDigits)
  .pipe(z.string().regex(/^\d{11}$/, "شناسه ملی شرکت باید ۱۱ رقم باشد"));

export const requestOtpSchema = z.object({
  mobile: mobileSchema,
  mode: z.enum(["user", "admin"]),
});

export const verifyOtpSchema = z.object({
  mobile: mobileSchema,
  code: otpSchema,
  mode: z.enum(["user", "admin"]),
  companyNationalId: companyNationalIdSchema.optional(),
});
