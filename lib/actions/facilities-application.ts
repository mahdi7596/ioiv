"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { ActionError } from "@/lib/actions/auth";
import { db } from "@/lib/db";
import { createOwnedFacilitiesFileBinding } from "@/lib/facilities-files/service";
import { facilitiesSubmissionInclude, loadFacilitiesSubmissionApplication, materializeFacilitiesEvidence, requiredFacilitiesSlots } from "@/lib/facilities/submission";

function slotFor(kind: string, year?: number) {
  return year ? `${kind}-${year}` : kind;
}

async function eligible(userId: string) {
  const [programme, company] = await Promise.all([
    db.facilitiesProgramConfiguration.findUnique({ where: { program: "FACILITIES" } }),
    db.company.findUnique({ where: { userId } }),
  ]);
  if (!programme?.isEnabled) throw new ActionError("ثبت درخواست تسهیلات در حال حاضر فعال نیست", 403);
  if (!company?.profileCompletedAt) throw new ActionError("ابتدا پروفایل شرکت و مدارک آن را تکمیل کنید", 403);
  return company;
}

export async function getFacilitiesWizard() {
  const session = await requireSession("user");
  const company = await eligible(session.subjectId);
  const intakes = await db.facilityIntake.findMany({
    where: {
      isEnabled: true,
      supplierConfigurations: {
        some: {
          isEnabled: true,
          questionnaireTemplateVersion: {
            is: {
              publishedAt: { not: null },
              retiredAt: null,
              storedFile: { is: { scanStatus: "PASSED", fileType: { in: ["DOC", "DOCX"] } } },
            },
          },
        },
      },
    },
    include: {
      supplierConfigurations: {
        where: {
          isEnabled: true,
          questionnaireTemplateVersion: {
            is: {
              publishedAt: { not: null },
              retiredAt: null,
              storedFile: { is: { scanStatus: "PASSED", fileType: { in: ["DOC", "DOCX"] } } },
            },
          },
        },
        include: { supplier: true, questionnaireTemplateVersion: true },
      },
    },
  });
  const applications = await db.facilitiesApplication.findMany({
    where: { userId: session.subjectId, companyId: company.id },
    orderBy: { createdAt: "desc" },
    include: facilitiesSubmissionInclude,
  });
  return { company, intakes, applications };
}

export async function createFacilitiesDraft(input: { intakeId: string; intakeSupplierId: string; facilityType: "FIXED_CAPITAL" | "WORKING_CAPITAL"; requestedAmountRial: string }) {
  const session = await requireSession("user");
  const company = await eligible(session.subjectId);
  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(input.requestedAmountRial);
  } catch {
    throw new ActionError("مبلغ درخواستی معتبر نیست");
  }
  if (amount.isNegative() || !["FIXED_CAPITAL", "WORKING_CAPITAL"].includes(input.facilityType)) throw new ActionError("اطلاعات درخواست معتبر نیست");

  try {
    const application = await db.$transaction(async (tx) => {
      const config = await tx.facilityIntakeSupplier.findFirst({
        where: { id: input.intakeSupplierId, intakeId: input.intakeId, isEnabled: true },
        include: { intake: true, questionnaireTemplateVersion: { include: { storedFile: true } } },
      });
      if (!config?.intake.isEnabled || !config.questionnaireTemplateVersion || config.questionnaireTemplateVersion.retiredAt || !config.questionnaireTemplateVersion.publishedAt || config.questionnaireTemplateVersion.storedFile.scanStatus !== "PASSED" || !["DOC", "DOCX"].includes(config.questionnaireTemplateVersion.storedFile.fileType)) throw new ActionError("تنظیمات انتخاب‌شده دیگر معتبر نیست؛ صفحه را تازه‌سازی کنید", 409);
      if (amount.gt(config.intake.maximumAmountRial)) throw new ActionError("مبلغ درخواستی از سقف دوره بیشتر است");
      const app = await tx.facilitiesApplication.create({
        data: {
          userId: session.subjectId,
          companyId: company.id,
          intakeId: config.intakeId,
          intakeSupplierId: config.id,
          questionnaireTemplateVersionId: config.questionnaireTemplateVersion.id,
          facilityType: input.facilityType,
          requestedAmountRial: amount,
          maximumAmountRialSnapshot: config.intake.maximumAmountRial,
          paymentEnabledSnapshot: config.intake.paymentEnabled,
          paymentAmountTomanSnapshot: config.intake.paymentEnabled ? config.intake.paymentAmountToman : null,
          paymentTermsVersionSnapshot: config.intake.paymentTermsVersion,
          companySnapshot: { create: { name: company.name, nationalId: company.nationalId, registrationNumber: company.registrationNumber, registrationPlace: company.registrationPlace, registrationDate: company.registrationDate, registeredCapitalRial: company.registeredCapitalRial, contactFullName: company.contactFullName, contactNationalCode: company.contactNationalCode } },
          shareholders: { create: (await tx.companyShareholder.findMany({ where: { companyId: company.id } })).map((shareholder) => ({ fullName: shareholder.fullName, ownershipPercentage: shareholder.ownershipPercentage })) },
          officers: { create: (await tx.companyOfficer.findMany({ where: { companyId: company.id } })).map((officer) => ({ fullName: officer.fullName, position: officer.position, isChiefExecutive: officer.isChiefExecutive })) },
        },
      });
      await tx.facilitiesAuditLog.create({ data: { applicationId: app.id, actorType: "USER", actorId: session.subjectId, action: "APPLICATION_CREATED", entityType: "FacilitiesApplication", entityId: app.id, metadata: {} } });
      return tx.facilitiesApplication.findUniqueOrThrow({ where: { id: app.id }, include: facilitiesSubmissionInclude });
    });
    revalidatePath("/dashboard/facilities-application");
    return application;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new ActionError("برای این دوره قبلاً یک درخواست ایجاد شده است", 409);
    throw error;
  }
}

export async function ensureFacilitiesApplicationSlot(input: { applicationId: string; kind: string; year?: number }) {
  const session = await requireSession("user");
  const application = await db.facilitiesApplication.findFirst({ where: { id: input.applicationId, userId: session.subjectId, status: "DRAFT" } });
  if (!application) throw new ActionError("دسترسی به پیش‌نویس امکان‌پذیر نیست", 403);
  const key = slotFor(input.kind, input.year);
  if (!/^(questionnaire|licences|active-contracts|insurance|trial-general|trial-subsidiary|credit-company|credit-ceo|credit-board|vat|tax|financial|questionnaire-attachment)(-14(0[2-5]))?$/.test(key) && !key.startsWith("questionnaire-attachment-")) throw new ActionError("نوع مدرک معتبر نیست");
  const existing = await db.facilitiesFileBinding.findFirst({ where: { applicationId: application.id, slotKey: key } });
  if (existing) return existing;
  try {
    return await createOwnedFacilitiesFileBinding({ userId: session.subjectId, companyId: application.companyId, applicationId: application.id, slotKey: key });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return db.facilitiesFileBinding.findFirstOrThrow({ where: { applicationId: application.id, slotKey: key } });
    throw error;
  }
}

export async function saveFacilitiesDraftDetails(input: { applicationId: string; employeeCount: number; boardOfficerId: string }) {
  const session = await requireSession("user");
  const result = await db.$transaction(async (tx) => {
    const application = await loadFacilitiesSubmissionApplication(tx, input.applicationId);
    if (!application || application.userId !== session.subjectId || application.status !== "DRAFT") throw new ActionError("دسترسی به پیش‌نویس امکان‌پذیر نیست", 403);
    if (!Number.isInteger(input.employeeCount) || input.employeeCount < 0 || !application.officers.some((officer) => officer.id === input.boardOfficerId && !officer.isChiefExecutive)) throw new ActionError("اطلاعات منابع انسانی یا عضو هیئت‌مدیره معتبر نیست");
    const ready = application.fileBindings.filter((binding) => binding.currentUpload?.lifecycleStatus === "PASSED");
    if (requiredFacilitiesSlots.some((key) => !ready.some((binding) => binding.slotKey === key)) || !ready.some((binding) => binding.slotKey.startsWith("tax-")) || !ready.some((binding) => binding.slotKey.startsWith("financial-"))) throw new ActionError("همه مدارک الزامی باید با موفقیت بررسی شده باشند");
    await materializeFacilitiesEvidence(tx, application, input);
    await tx.facilitiesAuditLog.create({ data: { applicationId: application.id, actorType: "USER", actorId: session.subjectId, action: "APPLICATION_UPDATED", entityType: "FacilitiesApplication", entityId: application.id, metadata: {} } });
    return true;
  });
  revalidatePath("/dashboard/facilities-application");
  return result;
}
