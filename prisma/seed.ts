import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ApplicationStatus,
  PaymentStatus,
  PrismaClient,
  UserRole,
} from "@prisma/client";
import { APPLICATION_ROUND, PAYMENT_AMOUNT_TOMAN } from "../lib/validations/shared";

const prisma = new PrismaClient();

const applicantMobile = "09108119122";
const companyNationalId = "14001234567";
const nationalCode = "0012345678";
const applicationId = "seed-app-09108119122-1403";
const userId = "seed-user-09108119122";
const paymentId = "seed-payment-09108119122-verified";
const defaultAdminMobiles = ["09390649614", "09127670204", "09132974595"];
const validationCertificateFieldKey = "validationCertificate";

const demoSubmissions = [
  {
    mobile: "09108119123",
    companyNationalId: "14000000123",
    nationalCode: "0011111123",
    status: ApplicationStatus.SUBMITTED,
    note: "پرونده آزمایشی ارسال شده؛ مناسب برای تست ارسال به ویرایش، پذیرش یا رد.",
  },
  {
    mobile: "09108119124",
    companyNationalId: "14000000124",
    nationalCode: "0011111124",
    status: ApplicationStatus.UNDER_REVIEW,
    note: "پرونده آزمایشی در حال بررسی؛ مناسب برای تست تصمیم نهایی یا درخواست ویرایش.",
  },
  {
    mobile: "09108119125",
    companyNationalId: "14000000125",
    nationalCode: "0011111125",
    status: ApplicationStatus.NEEDS_EDIT,
    note: "پرونده آزمایشی نیازمند ویرایش؛ کاربر باید بتواند فرم را اصلاح کند.",
  },
  {
    mobile: "09108119126",
    companyNationalId: "14000000126",
    nationalCode: "0011111126",
    status: ApplicationStatus.VALIDATION_COMPLETED,
    note: "فرآیند اعتبارسنجی این پرونده آزمایشی به پایان رسیده و گواهی PDF برای دانلود ثبت شده است.",
  },
] as const;

const seedFiles = [
  {
    id: "seed-file-tax-1400",
    fieldKey: "taxDeclarations.0.file",
    originalName: "tax-declaration-1400.pdf",
    label: "اظهارنامه مالیاتی ۱۴۰۰",
  },
  {
    id: "seed-file-tax-1401",
    fieldKey: "taxDeclarations.1.file",
    originalName: "tax-declaration-1401.pdf",
    label: "اظهارنامه مالیاتی ۱۴۰۱",
  },
  {
    id: "seed-file-tax-1402",
    fieldKey: "taxDeclarations.2.file",
    originalName: "tax-declaration-1402.pdf",
    label: "اظهارنامه مالیاتی ۱۴۰۲",
  },
  {
    id: "seed-file-financial-1402",
    fieldKey: "financials.0.file",
    originalName: "audited-financials-1402.pdf",
    label: "صورت مالی حسابرسی شده ۱۴۰۲",
  },
  {
    id: "seed-file-insurance-list",
    fieldKey: "humanResources.insuranceList",
    originalName: "insurance-list-1403.xlsx",
    label: "لیست بیمه ۱۴۰۳",
  },
  {
    id: "seed-file-general-ledger",
    fieldKey: "trialBalance.generalLedger",
    originalName: "general-ledger-trial-balance.pdf",
    label: "تراز کل",
  },
  {
    id: "seed-file-subsidiary-ledger",
    fieldKey: "trialBalance.subsidiaryLedger",
    originalName: "subsidiary-ledger-trial-balance.pdf",
    label: "تراز معین",
  },
  {
    id: "seed-file-credit-company",
    fieldKey: "creditReports.company",
    originalName: "company-credit-report.pdf",
    label: "گزارش اعتبارسنجی شرکت",
  },
  {
    id: "seed-file-credit-ceo",
    fieldKey: "creditReports.ceo",
    originalName: "ceo-credit-report.pdf",
    label: "گزارش اعتبارسنجی مدیرعامل",
  },
  {
    id: "seed-file-credit-board",
    fieldKey: "creditReports.boardMember",
    originalName: "board-member-credit-report.pdf",
    label: "گزارش اعتبارسنجی عضو هیات مدیره",
  },
] as const;

function uploadRoot() {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
}

function seededStoragePath(targetApplicationId: string, fieldKey: string, originalName: string) {
  return path.join(uploadRoot(), targetApplicationId, fieldKey, originalName);
}

async function ensureSeedUpload(targetApplicationId: string, file: (typeof seedFiles)[number]) {
  const storagePath = seededStoragePath(targetApplicationId, file.fieldKey, file.originalName);
  const body = [
    "%PDF-1.4",
    `% Seed placeholder: ${file.label}`,
    `Mobile: ${applicantMobile}`,
    "1 0 obj << /Type /Catalog >> endobj",
    "trailer << /Root 1 0 R >>",
    "%%EOF",
    "",
  ].join("\n");

  await mkdir(path.dirname(storagePath), { recursive: true });
  await writeFile(storagePath, body, "utf8");

  return {
    storagePath,
    size: Buffer.byteLength(body),
  };
}

async function ensureSeedPdfUpload(input: {
  applicationId: string;
  fieldKey: string;
  originalName: string;
  label: string;
  mobile: string;
}) {
  const storagePath = seededStoragePath(input.applicationId, input.fieldKey, input.originalName);
  const body = [
    "%PDF-1.4",
    `% Seed placeholder: ${input.label}`,
    `Mobile: ${input.mobile}`,
    "1 0 obj << /Type /Catalog >> endobj",
    "trailer << /Root 1 0 R >>",
    "%%EOF",
    "",
  ].join("\n");

  await mkdir(path.dirname(storagePath), { recursive: true });
  await writeFile(storagePath, body, "utf8");

  return {
    storagePath,
    size: Buffer.byteLength(body),
  };
}

function demoApplicationData(mobile: string) {
  return {
    taxDeclarations: [
      { year: "1400", file: { fileId: `demo-${mobile}-tax-1400`, name: `tax-${mobile}-1400.pdf` } },
      { year: "1401", file: { fileId: `demo-${mobile}-tax-1401`, name: `tax-${mobile}-1401.pdf` } },
    ],
    financials: [
      { year: "1402", file: { fileId: `demo-${mobile}-financial-1402`, name: `financial-${mobile}-1402.pdf` } },
    ],
    humanResources: {
      employeeCount: 24,
      insuranceList: { fileId: `demo-${mobile}-insurance-list`, name: `insurance-list-${mobile}.xlsx` },
    },
    trialBalance: {
      generalLedger: { fileId: `demo-${mobile}-general-ledger`, name: `general-ledger-${mobile}.pdf` },
      subsidiaryLedger: { fileId: `demo-${mobile}-subsidiary-ledger`, name: `subsidiary-ledger-${mobile}.pdf` },
    },
    creditReports: {
      company: { fileId: `demo-${mobile}-credit-company`, name: `credit-company-${mobile}.pdf` },
      ceo: { fileId: `demo-${mobile}-credit-ceo`, name: `credit-ceo-${mobile}.pdf` },
      boardMember: { fileId: `demo-${mobile}-credit-board`, name: `credit-board-${mobile}.pdf` },
    },
  };
}

function seedAdminMobiles() {
  const envMobiles = [
    process.env.SEED_ADMIN_MOBILE,
    process.env.SEED_ADMIN_MOBILES,
  ]
    .filter(Boolean)
    .flatMap((value) => value!.split(","))
    .map((mobile) => mobile.trim())
    .filter(Boolean);

  return [...new Set([...defaultAdminMobiles, ...envMobiles])];
}

async function main() {
  const seededAt = new Date();

  const adminMobiles = seedAdminMobiles();
  const admins = await Promise.all(
    adminMobiles.map((mobile) =>
      prisma.admin.upsert({
        where: { mobile },
        update: {
          role: UserRole.SUPER_ADMIN,
          active: true,
        },
        create: {
          name: "مدیر سامانه",
          mobile,
          role: UserRole.SUPER_ADMIN,
          active: true,
        },
      }),
    ),
  );
  const admin = admins[0];

  if (process.env.SEED_DEMO_DATA !== "true") {
    return;
  }

  const user = await prisma.user.upsert({
    where: { mobile: applicantMobile },
    update: {
      companyNationalId,
      nationalCode,
    },
    create: {
      id: userId,
      mobile: applicantMobile,
      companyNationalId,
      nationalCode,
    },
  });

  const fileRefs = Object.fromEntries(
    seedFiles.map((file) => [file.id, { fileId: file.id, name: file.originalName }]),
  );

  const application = await prisma.application.upsert({
    where: {
      mobile_companyNationalId_applicationRound: {
        mobile: applicantMobile,
        companyNationalId,
        applicationRound: APPLICATION_ROUND,
      },
    },
    update: {
      userId: user.id,
      nationalCode,
      status: ApplicationStatus.SUBMITTED,
      currentStep: 6,
      adminNote: null,
      submittedAt: seededAt,
      createdAt: seededAt,
      taxDeclarations: [
        { year: "1400", file: fileRefs["seed-file-tax-1400"] },
        { year: "1401", file: fileRefs["seed-file-tax-1401"] },
        { year: "1402", file: fileRefs["seed-file-tax-1402"] },
      ],
      financials: [{ year: "1402", file: fileRefs["seed-file-financial-1402"] }],
      humanResources: {
        employeeCount: 24,
        insuranceList: fileRefs["seed-file-insurance-list"],
      },
      trialBalance: {
        generalLedger: fileRefs["seed-file-general-ledger"],
        subsidiaryLedger: fileRefs["seed-file-subsidiary-ledger"],
      },
      creditReports: {
        company: fileRefs["seed-file-credit-company"],
        ceo: fileRefs["seed-file-credit-ceo"],
        boardMember: fileRefs["seed-file-credit-board"],
      },
    },
    create: {
      id: applicationId,
      userId: user.id,
      mobile: applicantMobile,
      companyNationalId,
      nationalCode,
      applicationRound: APPLICATION_ROUND,
      status: ApplicationStatus.SUBMITTED,
      currentStep: 6,
      submittedAt: seededAt,
      createdAt: seededAt,
      taxDeclarations: [
        { year: "1400", file: fileRefs["seed-file-tax-1400"] },
        { year: "1401", file: fileRefs["seed-file-tax-1401"] },
        { year: "1402", file: fileRefs["seed-file-tax-1402"] },
      ],
      financials: [{ year: "1402", file: fileRefs["seed-file-financial-1402"] }],
      humanResources: {
        employeeCount: 24,
        insuranceList: fileRefs["seed-file-insurance-list"],
      },
      trialBalance: {
        generalLedger: fileRefs["seed-file-general-ledger"],
        subsidiaryLedger: fileRefs["seed-file-subsidiary-ledger"],
      },
      creditReports: {
        company: fileRefs["seed-file-credit-company"],
        ceo: fileRefs["seed-file-credit-ceo"],
        boardMember: fileRefs["seed-file-credit-board"],
      },
    },
  });

  await prisma.payment.upsert({
    where: { id: paymentId },
    update: {
      applicationId: application.id,
      amountToman: PAYMENT_AMOUNT_TOMAN,
      status: PaymentStatus.VERIFIED,
      authority: "A00000000000000000000000009108119122",
      referenceId: "SEED-09108119122",
      rawData: {
        referenceId: "SEED-09108119122",
        seeded: true,
        message: "پرداخت آزمایشی تایید شده برای تست پنل مدیریت",
      },
    },
    create: {
      id: paymentId,
      applicationId: application.id,
      amountToman: PAYMENT_AMOUNT_TOMAN,
      status: PaymentStatus.VERIFIED,
      authority: "A00000000000000000000000009108119122",
      referenceId: "SEED-09108119122",
      rawData: {
        referenceId: "SEED-09108119122",
        seeded: true,
        message: "پرداخت آزمایشی تایید شده برای تست پنل مدیریت",
      },
    },
  });

  for (const file of seedFiles) {
    const stored = await ensureSeedUpload(application.id, file);

    await prisma.applicationFile.upsert({
      where: { id: file.id },
      update: {
        applicationId: application.id,
        fieldKey: file.fieldKey,
        originalName: file.originalName,
        mimeType: "application/pdf",
        size: stored.size,
        storagePath: stored.storagePath,
      },
      create: {
        id: file.id,
        applicationId: application.id,
        fieldKey: file.fieldKey,
        originalName: file.originalName,
        mimeType: "application/pdf",
        size: stored.size,
        storagePath: stored.storagePath,
      },
    });
  }

  await prisma.statusHistory.upsert({
    where: { id: "seed-history-payment-verified-09108119122" },
    update: {
      applicationId: application.id,
      previousStatus: ApplicationStatus.PENDING_PAYMENT,
      newStatus: ApplicationStatus.SUBMITTED,
      changedById: admin.id,
      note: "پرداخت آزمایشی تایید شد و پرونده برای تست بررسی مدیریت ارسال شد.",
    },
    create: {
      id: "seed-history-payment-verified-09108119122",
      applicationId: application.id,
      previousStatus: ApplicationStatus.PENDING_PAYMENT,
      newStatus: ApplicationStatus.SUBMITTED,
      changedById: admin.id,
      note: "پرداخت آزمایشی تایید شد و پرونده برای تست بررسی مدیریت ارسال شد.",
    },
  });

  for (const demo of demoSubmissions) {
    const demoUser = await prisma.user.upsert({
      where: { mobile: demo.mobile },
      update: {
        companyNationalId: demo.companyNationalId,
        nationalCode: demo.nationalCode,
      },
      create: {
        id: `seed-user-${demo.mobile}`,
        mobile: demo.mobile,
        companyNationalId: demo.companyNationalId,
        nationalCode: demo.nationalCode,
      },
    });

    const demoData = demoApplicationData(demo.mobile);
    const demoApplication = await prisma.application.upsert({
      where: {
        mobile_companyNationalId_applicationRound: {
          mobile: demo.mobile,
          companyNationalId: demo.companyNationalId,
          applicationRound: APPLICATION_ROUND,
        },
      },
      update: {
        userId: demoUser.id,
        nationalCode: demo.nationalCode,
        status: demo.status,
        currentStep: 6,
        adminNote: demo.status === ApplicationStatus.NEEDS_EDIT ? demo.note : null,
        submittedAt: seededAt,
        taxDeclarations: demoData.taxDeclarations,
        financials: demoData.financials,
        humanResources: demoData.humanResources,
        trialBalance: demoData.trialBalance,
        creditReports: demoData.creditReports,
      },
      create: {
        id: `seed-app-${demo.mobile}-${APPLICATION_ROUND}`,
        userId: demoUser.id,
        mobile: demo.mobile,
        companyNationalId: demo.companyNationalId,
        nationalCode: demo.nationalCode,
        applicationRound: APPLICATION_ROUND,
        status: demo.status,
        currentStep: 6,
        adminNote: demo.status === ApplicationStatus.NEEDS_EDIT ? demo.note : null,
        submittedAt: seededAt,
        taxDeclarations: demoData.taxDeclarations,
        financials: demoData.financials,
        humanResources: demoData.humanResources,
        trialBalance: demoData.trialBalance,
        creditReports: demoData.creditReports,
      },
    });

    await prisma.payment.upsert({
      where: { id: `seed-payment-${demo.mobile}-verified` },
      update: {
        applicationId: demoApplication.id,
        amountToman: PAYMENT_AMOUNT_TOMAN,
        status: PaymentStatus.VERIFIED,
        authority: `A000000000000000000000000${demo.mobile}`,
        referenceId: `SEED-${demo.mobile}`,
        rawData: {
          referenceId: `SEED-${demo.mobile}`,
          seeded: true,
          scenario: demo.status,
        },
      },
      create: {
        id: `seed-payment-${demo.mobile}-verified`,
        applicationId: demoApplication.id,
        amountToman: PAYMENT_AMOUNT_TOMAN,
        status: PaymentStatus.VERIFIED,
        authority: `A000000000000000000000000${demo.mobile}`,
        referenceId: `SEED-${demo.mobile}`,
        rawData: {
          referenceId: `SEED-${demo.mobile}`,
          seeded: true,
          scenario: demo.status,
        },
      },
    });

    await prisma.statusHistory.upsert({
      where: { id: `seed-history-${demo.mobile}-${demo.status}` },
      update: {
        applicationId: demoApplication.id,
        previousStatus: demo.status === ApplicationStatus.SUBMITTED ? ApplicationStatus.PENDING_PAYMENT : ApplicationStatus.SUBMITTED,
        newStatus: demo.status,
        changedById: admin.id,
        note: demo.note,
      },
      create: {
        id: `seed-history-${demo.mobile}-${demo.status}`,
        applicationId: demoApplication.id,
        previousStatus: demo.status === ApplicationStatus.SUBMITTED ? ApplicationStatus.PENDING_PAYMENT : ApplicationStatus.SUBMITTED,
        newStatus: demo.status,
        changedById: admin.id,
        note: demo.note,
      },
    });

    if (demo.status === ApplicationStatus.VALIDATION_COMPLETED) {
      const certificateId = `seed-file-${demo.mobile}-validation-certificate`;
      const certificateName = `validation-certificate-${demo.mobile}.pdf`;
      const stored = await ensureSeedPdfUpload({
        applicationId: demoApplication.id,
        fieldKey: validationCertificateFieldKey,
        originalName: certificateName,
        label: "گواهی پایان فرآیند اعتبارسنجی",
        mobile: demo.mobile,
      });

      await prisma.applicationFile.upsert({
        where: { id: certificateId },
        update: {
          applicationId: demoApplication.id,
          fieldKey: validationCertificateFieldKey,
          originalName: certificateName,
          mimeType: "application/pdf",
          size: stored.size,
          storagePath: stored.storagePath,
        },
        create: {
          id: certificateId,
          applicationId: demoApplication.id,
          fieldKey: validationCertificateFieldKey,
          originalName: certificateName,
          mimeType: "application/pdf",
          size: stored.size,
          storagePath: stored.storagePath,
        },
      });
    }
  }
}

main().finally(async () => {
  await prisma.$disconnect();
});
