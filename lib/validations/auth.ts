import { z } from "zod";
import { keepAsciiDigits } from "@/lib/input/digits";

export const mobileSchema = z
  .string()
  .transform(keepAsciiDigits)
  .pipe(z.string().regex(/^09\d{9}$/, "شماره موبایل معتبر نیست"));

export const otpSchema = z
  .string()
  .transform(keepAsciiDigits)
  .pipe(z.string().regex(/^\d{6}$/, "کد تایید باید ۶ رقم باشد"));

export const requestOtpSchema = z.object({
  mobile: mobileSchema,
  mode: z.enum(["user", "admin"]),
});

export const verifyOtpSchema = z.object({
  mobile: mobileSchema,
  code: otpSchema,
  mode: z.enum(["user", "admin"]),
});
