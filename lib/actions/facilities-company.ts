"use server";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { ActionError } from "@/lib/actions/auth";
import { companyDraftSchema, CEO_POSITION, normalizedText } from "@/lib/validations/facilities-company";
import { createOwnedFacilitiesFileBinding } from "@/lib/facilities-files/service";

const DOCUMENT_SLOTS = ["incorporation-notice", "articles-of-association", "board-changes-gazette", "capital-increase-gazette"] as const;

function dateOnly(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value || date > new Date()) throw new ActionError("تاریخ ثبت معتبر نیست");
  return date;
}

export async function getFacilitiesCompanyProfile() {
  const session = await requireSession("user");
  return db.company.findFirst({ where: { userId: session.subjectId }, include: { shareholders: true, officers: true, facilitiesFileBindings: { include: { currentUpload: { include: { storedFile: true } } } } } });
}

export async function saveFacilitiesCompanyDraft(input: unknown) {
  const session = await requireSession("user");
  const parsed = companyDraftSchema.safeParse(input);
  if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message || "اطلاعات پروفایل معتبر نیست");
  const value = parsed.data;
  const ceos = value.officers.filter((officer) => normalizedText(officer.position) === CEO_POSITION);
  if (ceos.length > 1) throw new ActionError("فقط یک مدیرعامل می‌تواند ثبت شود");
  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.company.findUnique({ where: { userId: session.subjectId } });
      if (current && value.version !== undefined && current.profileVersion !== value.version) throw new ActionError("پروفایل در جای دیگری تغییر کرده است؛ صفحه را تازه‌سازی کنید", 409);
      const fields = { name: value.name, nationalId: value.nationalId, registrationNumber: value.registrationNumber, registrationPlace: value.registrationPlace, registrationDate: dateOnly(value.registrationDate), registeredCapitalRial: new Prisma.Decimal(value.registeredCapitalRial), contactFullName: value.contactFullName, contactNationalCode: value.contactNationalCode, profileCompletedAt: null };
      const company = current ? await tx.company.update({ where: { id: current.id }, data: { ...fields, profileVersion: { increment: 1 } } }) : await tx.company.create({ data: { userId: session.subjectId, ...fields, profileVersion: 1 } });
      // Existing officer ids are deliberately retained so their identity slots cannot be reassigned.
      const retained = value.officers.filter((item) => item.id).map((item) => item.id!);
      if (retained.length !== new Set(retained).size) throw new ActionError("فهرست اعضا معتبر نیست");
      if (retained.length) {
        const ownedCount = await tx.companyOfficer.count({ where: { companyId: company.id, id: { in: retained } } });
        if (ownedCount !== retained.length) throw new ActionError("دسترسی به یکی از اعضا امکان‌پذیر نیست", 403);
      }
      const removable = await tx.companyOfficer.findMany({ where: { companyId: company.id, id: { notIn: retained } } });
      const officerBindings = await tx.facilitiesFileBinding.findMany({ where: { companyId: company.id, slotKey: { startsWith: "officer-" } }, select: { slotKey: true, currentUploadId: true } });
      if (removable.some((officer) => officerBindings.some((binding) => binding.slotKey === `officer-${officer.id}-identity-package` && binding.currentUploadId))) throw new ActionError("برای حذف عضو، ابتدا بسته هویتی او را جایگزین یا با پشتیبانی پیگیری کنید");
      await tx.companyShareholder.deleteMany({ where: { companyId: company.id } });
      await tx.companyShareholder.createMany({ data: value.shareholders.map((s) => ({ companyId: company.id, fullName: s.fullName, ownershipPercentage: new Prisma.Decimal(s.ownershipPercentage) })) });
      await tx.companyOfficer.deleteMany({ where: { companyId: company.id, id: { notIn: retained } } });
      for (const officer of value.officers) await tx.companyOfficer.upsert({ where: { id: officer.id ?? "__new__" }, create: { companyId: company.id, fullName: officer.fullName, position: officer.position, isChiefExecutive: normalizedText(officer.position) === CEO_POSITION }, update: { fullName: officer.fullName, position: officer.position, isChiefExecutive: normalizedText(officer.position) === CEO_POSITION } });
      return company;
    });
  } catch (error) {
    if (error instanceof ActionError) throw error;
    if ((error as { code?: string }).code === "P2002") throw new ActionError("این شناسه ملی شرکت قبلاً ثبت شده است");
    throw error;
  }
}

export async function ensureFacilitiesProfileDocumentSlot(kind: string, officerId?: string) {
  const session = await requireSession("user");
  const company = await db.company.findUnique({ where: { userId: session.subjectId } });
  if (!company) throw new ActionError("ابتدا پیش‌نویس پروفایل را ذخیره کنید");
  const slotKey = officerId ? `officer-${officerId}-identity-package` : `profile-${kind}`;
  if (!officerId && !DOCUMENT_SLOTS.includes(kind as typeof DOCUMENT_SLOTS[number])) throw new ActionError("نوع مدرک معتبر نیست");
  if (officerId && !await db.companyOfficer.findFirst({ where: { id: officerId, companyId: company.id } })) throw new ActionError("دسترسی به این عضو امکان‌پذیر نیست", 404);
  const existing = await db.facilitiesFileBinding.findFirst({ where: { userId: session.subjectId, companyId: company.id, scope: "COMPANY_PROFILE", slotKey } });
  return existing ?? createOwnedFacilitiesFileBinding({ userId: session.subjectId, companyId: company.id, slotKey });
}

export async function completeFacilitiesCompanyProfile(input: { version: number }) {
  const session = await requireSession("user");
  const company = await db.company.findUnique({ where: { userId: session.subjectId }, include: { shareholders: true, officers: true, facilitiesFileBindings: { include: { currentUpload: { include: { storedFile: true } } } } } });
  if (!company || company.profileVersion !== input.version) throw new ActionError("پروفایل تغییر کرده است؛ صفحه را تازه‌سازی کنید", 409);
  const fields = [company.name, company.nationalId, company.registrationNumber, company.registrationPlace, company.registrationDate, company.registeredCapitalRial, company.contactFullName, company.contactNationalCode];
  if (fields.some((field) => field === null || field === undefined) || !company.shareholders.length || !company.officers.length) throw new ActionError("همه اطلاعات و فهرست‌ها را تکمیل کنید");
  const total = company.shareholders.reduce((sum, item) => sum.plus(item.ownershipPercentage), new Prisma.Decimal(0));
  if (!total.equals(100)) throw new ActionError("مجموع درصد سهام باید دقیقاً ۱۰۰ باشد");
  const ceos = company.officers.filter((officer) => officer.isChiefExecutive && normalizedText(officer.position) === CEO_POSITION);
  if (ceos.length !== 1 || company.officers.some((officer) => (normalizedText(officer.position) === CEO_POSITION) !== officer.isChiefExecutive)) throw new ActionError("دقیقاً یک مدیرعامل با سمت «مدیرعامل» لازم است");
  const required = [...DOCUMENT_SLOTS.map((slot) => `profile-${slot}`), ...company.officers.map((officer) => `officer-${officer.id}-identity-package`)];
  const ready = new Set(company.facilitiesFileBindings.filter((binding) => binding.currentUpload?.lifecycleStatus === "PASSED" && binding.currentUpload.storedFile?.scanStatus === "PASSED").map((binding) => binding.slotKey));
  if (required.some((slot) => !ready.has(slot))) throw new ActionError("همه مدارک الزامی باید با موفقیت بررسی شده باشند");
  return db.company.updateMany({ where: { id: company.id, profileVersion: input.version }, data: { profileCompletedAt: new Date(), profileVersion: { increment: 1 } } });
}
