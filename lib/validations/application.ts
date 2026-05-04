import { z } from "zod";

const fileRefSchema = z.object({
  fileId: z.string().min(1),
  name: z.string().min(1),
});

const yearFileRowSchema = z.object({
  year: z.string().regex(/^\d{4}$/, "سال باید ۴ رقم باشد"),
  file: fileRefSchema,
});

const filledYearFileRows = (value: unknown) => {
  if (!Array.isArray(value)) return value;

  return value.filter((row) => {
    if (!row || typeof row !== "object") return false;
    const candidate = row as { year?: unknown; file?: unknown };
    return Boolean(candidate.year || candidate.file);
  });
};

const yearFileRowsWithMinimum = (minimum: number, message: string) =>
  z.preprocess(filledYearFileRows, z.array(yearFileRowSchema).min(minimum, message));

const humanResourcesDraftSchema = z
  .object({
    employeeCount: z.number().int().positive("تعداد نیروی انسانی باید بیشتر از صفر باشد").optional(),
    insuranceList: fileRefSchema.optional(),
  })
  .optional();

const humanResourcesFinalSchema = z.object({
  employeeCount: z.number().int().positive("تعداد نیروی انسانی باید بیشتر از صفر باشد"),
  insuranceList: fileRefSchema,
});

export const applicationDraftSchema = z.object({
  currentStep: z.number().int().min(1).max(6).optional(),
  taxDeclarations: z.array(yearFileRowSchema.partial()).optional(),
  financials: z.array(yearFileRowSchema.partial()).optional(),
  humanResources: humanResourcesDraftSchema,
  trialBalance: z
    .object({
      generalLedger: fileRefSchema.optional(),
      subsidiaryLedger: fileRefSchema.optional(),
    })
    .optional(),
  creditReports: z
    .object({
      company: fileRefSchema.optional(),
      ceo: fileRefSchema.optional(),
      boardMember: fileRefSchema.optional(),
    })
    .optional(),
});

export const finalSubmissionSchema = z.object({
  taxDeclarations: yearFileRowsWithMinimum(
    1,
    "حداقل یک اظهارنامه مالیاتی کامل شامل سال و فایل الزامی است",
  ),
  financials: yearFileRowsWithMinimum(
    1,
    "حداقل یک صورت مالی حسابرسی شده کامل شامل سال و فایل الزامی است",
  ),
  humanResources: humanResourcesFinalSchema,
  trialBalance: z.object({
    generalLedger: fileRefSchema,
    subsidiaryLedger: fileRefSchema,
  }),
  creditReports: z.object({
    company: fileRefSchema,
    ceo: fileRefSchema,
    boardMember: fileRefSchema,
  }),
  acceptedTerms: z
    .boolean()
    .refine((value) => value === true, "تایید غیرقابل استرداد بودن پرداخت الزامی است"),
});
