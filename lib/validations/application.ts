import { z } from "zod";

const fileRefSchema = z.object({
  fileId: z.string().min(1),
  name: z.string().min(1),
});

const yearFileRowSchema = z.object({
  year: z.string().regex(/^\d{4}$/, "سال باید ۴ رقم باشد"),
  file: fileRefSchema,
});

export const applicationDraftSchema = z.object({
  currentStep: z.number().int().min(1).max(5).optional(),
  taxDeclarations: z.array(yearFileRowSchema.partial()).optional(),
  financials: z.array(yearFileRowSchema.partial()).optional(),
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
  taxDeclarations: z
    .array(yearFileRowSchema)
    .min(3, "حداقل سه سال اظهارنامه مالیاتی الزامی است"),
  financials: z.array(yearFileRowSchema),
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
