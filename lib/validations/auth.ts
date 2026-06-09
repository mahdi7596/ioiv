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

const requiredTextSchema = (fieldName: string) =>
  z.string().trim().min(1, `${fieldName} الزامی است`);

export const companyContactNationalCodeSchema = z
  .string()
  .transform(keepAsciiDigits)
  .pipe(z.string().regex(/^\d{10}$/, "کد ملی رابط شرکت باید ۱۰ رقم باشد"));

export const requestOtpSchema = z.object({
  mobile: mobileSchema,
  mode: z.enum(["user", "admin"]),
});

export const verifyOtpSchema = z
  .object({
    mobile: mobileSchema,
    code: otpSchema,
    mode: z.enum(["user", "admin"]),
    companyName: requiredTextSchema("نام شرکت").optional(),
    companyNationalId: companyNationalIdSchema.optional(),
    companyContactFullName: requiredTextSchema("نام و نام خانوادگی رابط شرکت").optional(),
    companyContactNationalCode: companyContactNationalCodeSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode !== "user") {
      return;
    }

    const registrationKeys = [
      "companyName",
      "companyNationalId",
      "companyContactFullName",
      "companyContactNationalCode",
    ] as const;
    const hasRegistrationData = registrationKeys.some((key) => Boolean(data[key]));

    if (!hasRegistrationData) {
      return;
    }

    for (const key of registrationKeys) {
      if (!data[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "تکمیل همه فیلدهای ثبت‌نام الزامی است",
        });
      }
    }
  });
