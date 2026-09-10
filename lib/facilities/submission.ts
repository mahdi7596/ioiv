import { Prisma } from "@prisma/client";

import type { FacilitiesApplication, FacilitiesApplicationEvidence, FacilitiesFileBinding, FacilitiesFileUpload, StoredFile, User } from "@prisma/client";

export type FacilitiesSubmissionInput = {
  employeeCount: number;
  boardOfficerId: string;
};

type SubmissionApplication = FacilitiesApplication & {
  companySnapshot: {
    name: string | null;
    nationalId: string | null;
    registrationNumber: string | null;
    registrationPlace: string | null;
    registrationDate: Date | null;
    registeredCapitalRial: Prisma.Decimal | null;
    contactFullName: string | null;
    contactNationalCode: string | null;
  } | null;
  shareholders: { fullName: string; ownershipPercentage: Prisma.Decimal }[];
  officers: { id: string; fullName: string; position: string; isChiefExecutive: boolean }[];
  fileBindings: (FacilitiesFileBinding & {
    currentUpload: (FacilitiesFileUpload & { storedFile: StoredFile | null }) | null;
  })[];
  evidence: FacilitiesApplicationEvidence[];
  payments: { id: string; amountToman: number; status: string; authority: string | null; referenceId: string | null }[];
  user: Pick<User, "mobile">;
};

export type FacilitiesSubmissionReadiness = {
  application: SubmissionApplication;
  issues: string[];
  ready: boolean;
};

export const requiredFacilitiesSlots = [
  "questionnaire",
  "licences",
  "active-contracts",
  "insurance",
  "trial-general",
  "trial-subsidiary",
  "credit-company",
  "credit-ceo",
  "credit-board",
  "vat-1404",
] as const;

export const facilitiesSubmissionInclude = {
  companySnapshot: true,
  shareholders: true,
  officers: true,
  fileBindings: { include: { currentUpload: { include: { storedFile: true } } } },
  evidence: true,
  payments: { select: { id: true, amountToman: true, status: true, authority: true, referenceId: true } },
  user: { select: { mobile: true } },
} as const;

function nonEmpty(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function isNationalId(value: string | null | undefined, length: number) {
  return Boolean(value && new RegExp(`^[0-9۰-۹]{${length}}$`).test(value));
}

function fileIsReady(binding: SubmissionApplication["fileBindings"][number]) {
  return binding.currentUpload?.lifecycleStatus === "PASSED" && binding.currentUpload.storedFile?.scanStatus === "PASSED";
}

function expectedType(slotKey: string) {
  if (slotKey === "questionnaire") return ["DOC", "DOCX"];
  if (slotKey === "licences" || slotKey === "active-contracts" || slotKey.startsWith("vat-")) return ["ZIP"];
  return ["PDF", "DOC", "DOCX", "XLS", "XLSX", "CSV", "ZIP"];
}

function hasReadySlot(application: SubmissionApplication, slotKey: string) {
  return application.fileBindings.some((binding) => {
    if (binding.slotKey !== slotKey || !fileIsReady(binding)) return false;
    return expectedType(slotKey).includes(binding.currentUpload?.storedFile?.fileType ?? "");
  });
}

function hasReadyYearSlot(application: SubmissionApplication, prefix: "tax" | "financial") {
  return application.fileBindings.some((binding) => {
    if (!binding.slotKey.startsWith(`${prefix}-`) || !fileIsReady(binding)) return false;
    return expectedType(binding.slotKey).includes(binding.currentUpload?.storedFile?.fileType ?? "");
  });
}

export async function loadFacilitiesSubmissionApplication(tx: Prisma.TransactionClient, applicationId: string) {
  return tx.facilitiesApplication.findUnique({ where: { id: applicationId }, include: facilitiesSubmissionInclude });
}

export function checkFacilitiesSubmissionReadiness(
  application: SubmissionApplication,
  input: FacilitiesSubmissionInput,
): FacilitiesSubmissionReadiness {
  const issues: string[] = [];
  const snapshot = application.companySnapshot;

  if (!snapshot || !nonEmpty(snapshot.name) || !isNationalId(snapshot.nationalId, 11) || !nonEmpty(snapshot.registrationNumber) || !nonEmpty(snapshot.registrationPlace) || !snapshot.registrationDate || !snapshot.registeredCapitalRial || snapshot.registeredCapitalRial.isNegative() || !nonEmpty(snapshot.contactFullName) || !isNationalId(snapshot.contactNationalCode, 10)) {
    issues.push("اطلاعات پروفایل شرکت کامل نیست");
  }

  if (application.shareholders.length === 0) {
    issues.push("حداقل یک سهامدار باید ثبت شده باشد");
  } else {
    const total = application.shareholders.reduce((sum, shareholder) => sum.plus(shareholder.ownershipPercentage), new Prisma.Decimal(0));
    if (!total.eq(100)) issues.push("درصد مالکیت سهامداران باید دقیقاً ۱۰۰ درصد باشد");
  }

  const ceos = application.officers.filter((officer) => officer.isChiefExecutive && officer.position === "مدیرعامل");
  const boardMembers = application.officers.filter((officer) => !officer.isChiefExecutive);
  if (ceos.length !== 1 || boardMembers.length === 0) issues.push("اطلاعات مدیرعامل و اعضای هیئت‌مدیره کامل نیست");

  if (!application.requestedAmountRial.isZero() && application.requestedAmountRial.isNegative()) issues.push("مبلغ درخواستی معتبر نیست");
  if (application.requestedAmountRial.gt(application.maximumAmountRialSnapshot)) issues.push("مبلغ درخواستی از سقف دوره بیشتر است");
  if (!["FIXED_CAPITAL", "WORKING_CAPITAL"].includes(application.facilityType)) issues.push("نوع تسهیلات معتبر نیست");

  for (const slotKey of requiredFacilitiesSlots) {
    if (!hasReadySlot(application, slotKey)) issues.push(`مدرک «${slotKey}» کامل و بررسی‌شده نیست`);
  }
  if (!hasReadyYearSlot(application, "tax")) issues.push("حداقل یک اظهارنامه مالیاتی کامل لازم است");
  if (!hasReadyYearSlot(application, "financial")) issues.push("حداقل یک صورت مالی حسابرسی‌شده کامل لازم است");

  if (!Number.isInteger(input.employeeCount) || input.employeeCount < 0) issues.push("تعداد کارکنان معتبر نیست");
  if (!boardMembers.some((officer) => officer.id === input.boardOfficerId)) issues.push("عضو هیئت‌مدیره برای گزارش اعتباری معتبر نیست");

  const insuranceEvidence = application.evidence.find((item) => item.kind === "insurance");
  if (insuranceEvidence && insuranceEvidence.employeeCount !== null && insuranceEvidence.employeeCount !== input.employeeCount) issues.push("تعداد کارکنان با اطلاعات ذخیره‌شده یکسان نیست");
  const boardEvidence = application.evidence.find((item) => item.kind === "credit-board");
  if (boardEvidence && boardEvidence.officerId !== null && boardEvidence.officerId !== input.boardOfficerId) issues.push("عضو هیئت‌مدیره با اطلاعات ذخیره‌شده یکسان نیست");

  if (application.paymentEnabledSnapshot && (!application.paymentAmountTomanSnapshot || application.paymentAmountTomanSnapshot <= 0)) issues.push("تنظیمات پرداخت دوره معتبر نیست");

  return { application, issues, ready: issues.length === 0 };
}

function evidenceForBinding(binding: SubmissionApplication["fileBindings"][number], input: FacilitiesSubmissionInput) {
  if (!binding.applicationId) return null;
  const [kind, yearText] = binding.slotKey.split("-");
  if (binding.slotKey.startsWith("questionnaire-attachment-")) return null;
  const normalizedKind = binding.slotKey.startsWith("tax-") ? "tax" : binding.slotKey.startsWith("financial-") ? "financial" : binding.slotKey.startsWith("vat-") ? "vat" : binding.slotKey;
  return {
    applicationId: binding.applicationId,
    bindingId: binding.id,
    kind: normalizedKind,
    year: ["tax", "financial", "vat"].includes(kind) ? Number(yearText) : undefined,
    officerId: binding.slotKey === "credit-board" ? input.boardOfficerId : undefined,
    employeeCount: binding.slotKey === "insurance" ? input.employeeCount : undefined,
  };
}

export async function materializeFacilitiesEvidence(tx: Prisma.TransactionClient, application: SubmissionApplication, input: FacilitiesSubmissionInput) {
  for (const binding of application.fileBindings.filter(fileIsReady)) {
    const data = evidenceForBinding(binding, input);
    if (!data) continue;
    await tx.facilitiesApplicationEvidence.upsert({
      where: { bindingId: binding.id },
      create: data,
      update: { officerId: data.officerId, employeeCount: data.employeeCount },
    });
  }
}
