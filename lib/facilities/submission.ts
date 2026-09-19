import { Prisma } from "@prisma/client";

import type { FacilitiesApplication, FacilitiesApplicationEvidence, FacilitiesFileBinding, FacilitiesFileUpload, StoredFile, User } from "@prisma/client";

import { facilitiesDocumentLabel } from "./document-labels";
import { FACILITIES_EDITABLE_STATUSES } from "@/lib/facilities/review-status";
import { isCeoRole } from "@/lib/validations/facilities-company";

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
    contactMobile: string | null;
  } | null;
  shareholders: { fullName: string; nationalId: string | null; ownershipPercentage: Prisma.Decimal }[];
  officers: { id: string; fullName: string; position: string; isChiefExecutive: boolean }[];
  fileBindings: (FacilitiesFileBinding & {
    currentUpload: (FacilitiesFileUpload & { storedFile: Pick<StoredFile, "id" | "originalName" | "fileType" | "byteSize" | "scanStatus"> | null }) | null;
  })[];
  evidence: FacilitiesApplicationEvidence[];
  payments: { id: string; amountToman: number; status: string; authority: string | null; referenceId: string | null }[];
  user: Pick<User, "mobile">;
  correctionRequests: { id: string; sequence: number; note: string; openedAt: Date; resolvedAt: Date | null; smsStatus: string }[];
  history: { id: string; previousStatus: string | null; newStatus: string; note: string | null; createdAt: Date }[];
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
  "tax-1404",
  "financial-1404",
  "financial-1403",
] as const;

export const facilitiesSubmissionInclude = {
  paymentObligation: { select: { state: true } },
  companySnapshot: true,
  shareholders: true,
  officers: true,
  fileBindings: { include: { currentUpload: { include: { storedFile: { select: { id: true, originalName: true, fileType: true, byteSize: true, scanStatus: true } } } } } },
  evidence: true,
  payments: { select: { id: true, amountToman: true, status: true, authority: true, referenceId: true, createdAt: true, updatedAt: true } },
  user: { select: { mobile: true } },
  correctionRequests: { orderBy: { sequence: "desc" as const }, select: { id: true, sequence: true, note: true, openedAt: true, resolvedAt: true, smsStatus: true } },
  history: { orderBy: { createdAt: "desc" as const }, select: { id: true, previousStatus: true, newStatus: true, note: true, createdAt: true } },
} as const;

function nonEmpty(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function isNationalId(value: string | null | undefined, length: number) {
  return Boolean(value && new RegExp(`^[0-9۰-۹]{${length}}$`).test(value));
}

function isMobile(value: string | null | undefined) {
  return Boolean(value && /^09[0-9۰-۹]{9}$/.test(value.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))));
}

function fileIsReady(binding: SubmissionApplication["fileBindings"][number]) {
  return binding.currentUpload?.lifecycleStatus === "PASSED" && binding.currentUpload.storedFile?.scanStatus === "PASSED";
}

function expectedType(slotKey: string) {
  if (slotKey === "questionnaire") return ["DOC", "DOCX"];
  if (slotKey === "licences" || slotKey === "active-contracts" || slotKey.startsWith("vat-")) return ["ZIP"];
  return ["PDF", "DOC", "DOCX", "XLS", "XLSX", "CSV", "ZIP", "JPG", "PNG", "WEBP", "HEIC"];
}

function hasReadySlot(application: SubmissionApplication, slotKey: string) {
  return application.fileBindings.some((binding) => {
    if (binding.slotKey !== slotKey || !fileIsReady(binding)) return false;
    return expectedType(slotKey).includes(binding.currentUpload?.storedFile?.fileType ?? "");
  });
}

export async function loadFacilitiesSubmissionApplication(tx: Prisma.TransactionClient, applicationId: string) {
  return tx.facilitiesApplication.findUnique({ where: { id: applicationId }, include: facilitiesSubmissionInclude });
}

type CompanyOfficerSource = { id: string; fullName: string; position: string; isChiefExecutive: boolean };

/**
 * Upsert the application's officer snapshot from the live company officers, keyed by
 * sourceCompanyOfficerId (falling back to a value match for legacy rows created without it).
 * Snapshot rows that no longer map to a company officer are dropped, except any already
 * referenced by a credit report so existing evidence is never orphaned.
 */
async function syncFacilitiesOfficerSnapshot(tx: Prisma.TransactionClient, applicationId: string, officers: CompanyOfficerSource[]) {
  const existing = await tx.facilitiesApplicationOfficer.findMany({ where: { applicationId } });
  const retained: string[] = [];
  for (const officer of officers) {
    const snapshot = existing.find((item) => item.sourceCompanyOfficerId === officer.id)
      ?? existing.find((item) => !item.sourceCompanyOfficerId && item.fullName === officer.fullName && item.position === officer.position && item.isChiefExecutive === officer.isChiefExecutive);
    const saved = snapshot
      ? await tx.facilitiesApplicationOfficer.update({ where: { id: snapshot.id }, data: { sourceCompanyOfficerId: officer.id, fullName: officer.fullName, position: officer.position, isChiefExecutive: officer.isChiefExecutive } })
      : await tx.facilitiesApplicationOfficer.create({ data: { applicationId, sourceCompanyOfficerId: officer.id, fullName: officer.fullName, position: officer.position, isChiefExecutive: officer.isChiefExecutive } });
    retained.push(saved.id);
  }
  await tx.$executeRaw`SELECT public.prune_editable_facilities_officers(${applicationId}, ${retained}::text[])`;
}

/**
 * Lightweight snapshot re-sync for the editable (DRAFT / NEEDS_EDIT) wizard paths.
 *
 * Unlike {@link refreshFacilitiesProfileSnapshot}, this never gates on profile-document
 * completeness, so it can safely run on wizard load / draft save. It keeps the company,
 * shareholder and officer snapshots aligned with the live company profile — most importantly
 * populating the board-member dropdown when officers were added after the draft was created.
 */
export async function refreshFacilitiesEditableSnapshot(tx: Prisma.TransactionClient, applicationId: string) {
  await tx.$queryRaw`SELECT id FROM "FacilitiesApplication" WHERE id=${applicationId} FOR UPDATE`;
  const application = await tx.facilitiesApplication.findUnique({ where: { id: applicationId }, select: { companyId: true, status: true } });
  if (!application || !FACILITIES_EDITABLE_STATUSES.includes(application.status)) return;
  await tx.$queryRaw`SELECT id FROM "Company" WHERE id=${application.companyId} FOR UPDATE`;
  const company = await tx.company.findUnique({
    where: { id: application.companyId },
    include: { shareholders: true, officers: true },
  });
  if (!company) return;

  await tx.facilitiesApplicationCompanySnapshot.update({
    where: { applicationId },
    data: {
      name: company.name,
      nationalId: company.nationalId,
      registrationNumber: company.registrationNumber,
      registrationPlace: company.registrationPlace,
      registrationDate: company.registrationDate,
      registeredCapitalRial: company.registeredCapitalRial,
      contactFullName: company.contactFullName,
      contactNationalCode: company.contactNationalCode,
      contactMobile: company.contactMobile,
    },
  });
  await tx.$executeRaw`SELECT public.clear_editable_facilities_shareholders(${applicationId})`;
  await tx.facilitiesApplicationShareholder.createMany({ data: company.shareholders.map((shareholder) => ({ applicationId, fullName: shareholder.fullName, nationalId: shareholder.nationalId, ownershipPercentage: shareholder.ownershipPercentage })) });
  await syncFacilitiesOfficerSnapshot(tx, applicationId, company.officers);
}

export async function refreshFacilitiesProfileSnapshot(tx: Prisma.TransactionClient, applicationId: string) {
  await tx.$queryRaw`SELECT id FROM "FacilitiesApplication" WHERE id=${applicationId} FOR UPDATE`;
  const application = await tx.facilitiesApplication.findUnique({ where: { id: applicationId }, select: { companyId: true, status: true } });
  if (!application || application.status !== "DRAFT") return;
  await tx.company.update({ where: { id: application.companyId }, data: { updatedAt: new Date() } });
  const company = await tx.company.findUnique({
    where: { id: application.companyId },
    include: {
      shareholders: true,
      officers: true,
      facilitiesFileBindings: { include: { currentUpload: { include: { storedFile: true } } } },
    },
  });
  if (!company?.profileCompletedAt) throw new Error("FACILITIES_PROFILE_INCOMPLETE");
  const ready = new Set(company.facilitiesFileBindings.filter((binding) => binding.currentUpload?.lifecycleStatus === "PASSED" && binding.currentUpload.storedFile?.scanStatus === "PASSED").map((binding) => binding.slotKey));
  const requiredProfileSlots = [
    "profile-incorporation-notice",
    "profile-articles-of-association",
    "profile-board-changes-gazette",
    "profile-capital-increase-gazette",
    ...company.officers.map((officer) => `officer-${officer.id}-identity-package`),
  ];
  if (requiredProfileSlots.some((slot) => !ready.has(slot))) throw new Error("FACILITIES_PROFILE_INCOMPLETE");

  await tx.facilitiesApplicationCompanySnapshot.update({
    where: { applicationId },
    data: {
      name: company.name,
      nationalId: company.nationalId,
      registrationNumber: company.registrationNumber,
      registrationPlace: company.registrationPlace,
      registrationDate: company.registrationDate,
      registeredCapitalRial: company.registeredCapitalRial,
      contactFullName: company.contactFullName,
      contactNationalCode: company.contactNationalCode,
      contactMobile: company.contactMobile,
    },
  });
  await tx.$executeRaw`SELECT public.clear_editable_facilities_shareholders(${applicationId})`;
  await tx.facilitiesApplicationShareholder.createMany({ data: company.shareholders.map((shareholder) => ({ applicationId, fullName: shareholder.fullName, nationalId: shareholder.nationalId, ownershipPercentage: shareholder.ownershipPercentage })) });
  await syncFacilitiesOfficerSnapshot(tx, applicationId, company.officers);
}

// The credit-report board member and employee count are no longer collected from
// the applicant. Derive them from the application: reuse any evidence already
// materialized (keeps NEEDS_EDIT/repeat submits consistent), otherwise fall back
// to the sole/first non-CEO board member and an employee count of zero. The profile
// guarantees at least one non-CEO board member, so credit-board evidence still links
// to a real officer for admin review, export, and the credit report.
export function deriveFacilitiesSubmissionInput(application: SubmissionApplication): FacilitiesSubmissionInput {
  const firstBoardMember = application.officers.find((officer) => !officer.isChiefExecutive);
  const boardEvidence = application.evidence.find((item) => item.kind === "credit-board");
  const insuranceEvidence = application.evidence.find((item) => item.kind === "insurance");
  return {
    boardOfficerId: boardEvidence?.officerId ?? firstBoardMember?.id ?? "",
    employeeCount: insuranceEvidence?.employeeCount ?? 0,
  };
}

export function checkFacilitiesSubmissionReadiness(
  application: SubmissionApplication,
  input: FacilitiesSubmissionInput,
): FacilitiesSubmissionReadiness {
  const issues: string[] = [];
  const snapshot = application.companySnapshot;

  if (!snapshot || !nonEmpty(snapshot.name) || !isNationalId(snapshot.nationalId, 11) || !nonEmpty(snapshot.registrationNumber) || !nonEmpty(snapshot.registrationPlace) || !snapshot.registrationDate || !snapshot.registeredCapitalRial || snapshot.registeredCapitalRial.isNegative() || !nonEmpty(snapshot.contactFullName) || !isMobile(snapshot.contactMobile)) {
    issues.push("اطلاعات پروفایل شرکت کامل نیست");
  }

  if (application.shareholders.length === 0) {
    issues.push("حداقل یک سهامدار باید ثبت شده باشد");
  } else {
    const total = application.shareholders.reduce((sum, shareholder) => sum.plus(shareholder.ownershipPercentage), new Prisma.Decimal(0));
    if (!total.eq(100)) issues.push("درصد مالکیت سهامداران باید دقیقاً ۱۰۰ درصد باشد");
  }

  const ceos = application.officers.filter((officer) => officer.isChiefExecutive && isCeoRole(officer.position));
  const boardMembers = application.officers.filter((officer) => !officer.isChiefExecutive);
  if (ceos.length !== 1 || boardMembers.length === 0) issues.push("اطلاعات مدیرعامل و اعضای هیئت‌مدیره کامل نیست");

  if (!application.requestedAmountRial.isZero() && application.requestedAmountRial.isNegative()) issues.push("مبلغ درخواستی معتبر نیست");
  if (application.requestedAmountRial.gt(application.maximumAmountRialSnapshot)) issues.push("مبلغ درخواستی از سقف دوره بیشتر است");
  if (!["FIXED_CAPITAL", "WORKING_CAPITAL"].includes(application.facilityType)) issues.push("نوع تسهیلات معتبر نیست");

  for (const slotKey of requiredFacilitiesSlots) {
    if (!hasReadySlot(application, slotKey)) issues.push(`مدرک «${facilitiesDocumentLabel(slotKey)}» کامل و بررسی‌شده نیست`);
  }

  if (!Number.isInteger(input.employeeCount) || input.employeeCount < 0) issues.push("تعداد کارکنان معتبر نیست");
  if (!boardMembers.some((officer) => officer.id === input.boardOfficerId)) issues.push("عضو هیئت‌مدیره برای گزارش اعتباری معتبر نیست");

  if (application.status !== "NEEDS_EDIT") {
    const insuranceEvidence = application.evidence.find((item) => item.kind === "insurance");
    if (insuranceEvidence && insuranceEvidence.employeeCount !== null && insuranceEvidence.employeeCount !== input.employeeCount) issues.push("تعداد کارکنان با اطلاعات ذخیره‌شده یکسان نیست");
    const boardEvidence = application.evidence.find((item) => item.kind === "credit-board");
    if (boardEvidence && boardEvidence.officerId !== null && boardEvidence.officerId !== input.boardOfficerId) issues.push("عضو هیئت‌مدیره با اطلاعات ذخیره‌شده یکسان نیست");
  }

  if (application.paymentEnabledSnapshot && (!application.paymentAmountTomanSnapshot || application.paymentAmountTomanSnapshot <= 0)) issues.push("تنظیمات پرداخت دوره معتبر نیست");

  return { application, issues, ready: issues.length === 0 };
}

// A correction can target either an application-scoped document (checked via
// application.fileBindings, already loaded) or a company-profile-scoped one
// (اساسنامه, آگهی تأسیس, ...), which lives on the company and is fetched
// separately here. There is no structured link from a correction note to the
// specific slot it refers to, so this only proves *something* new was
// uploaded since the correction was opened, not that the flagged item itself
// was fixed — see docs/2026-09-15-architecture-and-security-audit.md follow-up.
export async function isCorrectionAddressed(
  tx: Prisma.TransactionClient,
  application: Pick<SubmissionApplication, "companyId" | "fileBindings">,
  correction: { openedAt: Date },
) {
  const applicationUploadIsNew = application.fileBindings.some(
    (binding) => binding.currentUpload?.lifecycleStatus === "PASSED" && binding.currentUpload.createdAt > correction.openedAt,
  );
  if (applicationUploadIsNew) return true;

  const profileUpload = await tx.facilitiesFileBinding.findFirst({
    where: {
      companyId: application.companyId,
      scope: "COMPANY_PROFILE",
      currentUpload: { lifecycleStatus: "PASSED", createdAt: { gt: correction.openedAt } },
    },
    select: { id: true },
  });
  return Boolean(profileUpload);
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
