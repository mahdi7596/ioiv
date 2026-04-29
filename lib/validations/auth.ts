import { z } from "zod";

export const mobileSchema = z
  .string()
  .regex(/^09\d{9}$/, "شماره موبایل معتبر نیست");

export const otpSchema = z
  .string()
  .regex(/^\d{4}$/, "کد تایید باید ۴ رقم باشد");

export const companyNationalIdSchema = z
  .string()
  .regex(/^\d{11}$/, "شناسه ملی شرکت باید ۱۱ رقم باشد");

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
