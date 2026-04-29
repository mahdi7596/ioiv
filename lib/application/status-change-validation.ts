import type { ApplicationStatus } from "@prisma/client";

type StatusChangeConfirmationInput = {
  nextStatus: ApplicationStatus | string;
  companyNationalId: string;
  rejectionCompanyNationalId: string;
};

type StatusChangeConfirmationResult =
  | { valid: true }
  | { valid: false; message: string };

export function validateStatusChangeConfirmation({
  nextStatus,
  companyNationalId,
  rejectionCompanyNationalId,
}: StatusChangeConfirmationInput): StatusChangeConfirmationResult {
  if (nextStatus !== "REJECTED") {
    return { valid: true };
  }

  const expected = companyNationalId.trim();
  const submitted = rejectionCompanyNationalId.trim();

  if (!submitted) {
    return {
      valid: false,
      message: "برای رد پرونده باید شناسه ملی ثبت شده پرونده را وارد کنید.",
    };
  }

  if (submitted !== expected) {
    return {
      valid: false,
      message: "شناسه ملی وارد شده با شناسه ملی پرونده مطابقت ندارد.",
    };
  }

  return { valid: true };
}
