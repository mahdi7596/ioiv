import * as XLSX from "xlsx";
import { ApplicationStatus } from "@prisma/client";
import { applicationStatusLabels } from "@/components/admin/StatusBadge";
import { db } from "@/lib/db";

type ExportFilters = {
  q?: string;
  status?: string;
  sort?: string;
};

type SubmissionExportApplication = {
  createdAt: Date;
  submittedAt: Date | null;
  status: string;
  mobile: string;
  companyName: string | null;
  companyNationalId: string;
  companyContactFullName: string | null;
  companyContactNationalCode: string | null;
  taxDeclarations: unknown;
  financials: unknown;
  humanResources: unknown;
  adminNote: string | null;
  payments: Array<{ status: string; referenceId: string | null }>;
  files: Array<{ fieldKey: string }>;
};

function toCsvValue(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function isCompleteYearFileRow(row: unknown) {
  if (!row || typeof row !== "object") return false;
  const candidate = row as { year?: unknown; file?: unknown };
  return Boolean(candidate.year && candidate.file);
}

function countCompleteYearFileRows(value: unknown) {
  return Array.isArray(value) ? value.filter(isCompleteYearFileRow).length : 0;
}

function getEmployeeCount(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const employeeCount = (value as { employeeCount?: unknown }).employeeCount;
  return typeof employeeCount === "number" && Number.isFinite(employeeCount) ? employeeCount : "";
}

export async function getSubmissionExportRows(filters: ExportFilters) {
  const q = filters.q?.trim();
  const status = filters.status as ApplicationStatus | undefined;
  const applications = await db.application.findMany({
    where: {
      ...(status && Object.values(ApplicationStatus).includes(status) ? { status } : {}),
      ...(q
        ? {
            OR: [
              { mobile: { contains: q } },
              { companyName: { contains: q } },
              { companyNationalId: { contains: q } },
              { companyContactFullName: { contains: q } },
              { companyContactNationalCode: { contains: q } },
              { nationalCode: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: filters.sort === "oldest" ? "asc" : "desc" },
    include: {
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      files: true,
    },
  });

  return applications.map(createSubmissionExportRow);
}

export function createSubmissionExportRow(application: SubmissionExportApplication) {
  const latestPayment = application.payments[0];
  const taxCompleteRows = countCompleteYearFileRows(application.taxDeclarations);
  const financialCompleteRows = countCompleteYearFileRows(application.financials);

  return {
    "تاریخ ایجاد": application.createdAt.toISOString(),
    "تاریخ ارسال": application.submittedAt?.toISOString() || "",
    "وضعیت": applicationStatusLabels[application.status] || application.status,
    "موبایل": application.mobile,
    "نام شرکت": application.companyName || "",
    "شناسه ملی شرکت": application.companyNationalId,
    "نام رابط شرکت": application.companyContactFullName || "",
    "کد ملی رابط شرکت": application.companyContactNationalCode || "",
    "وضعیت پرداخت": latestPayment?.status || "",
    "کد رهگیری پرداخت": latestPayment?.referenceId || "",
    "تعداد نیروی انسانی": getEmployeeCount(application.humanResources),
    "تعداد اظهارنامه مالیاتی کامل": taxCompleteRows,
    "اظهارنامه مالیاتی تکمیل است": taxCompleteRows >= 1 ? "بله" : "خیر",
    "تعداد صورت مالی حسابرسی شده کامل": financialCompleteRows,
    "صورت مالی حسابرسی شده تکمیل است": financialCompleteRows >= 1 ? "بله" : "خیر",
    "لیست بیمه بارگذاری شده": application.files.some(
      (file) => file.fieldKey === "humanResources.insuranceList",
    )
      ? "بله"
      : "خیر",
    "تعداد فایل اظهارنامه مالیاتی": application.files.filter((file) =>
      file.fieldKey.startsWith("taxDeclarations"),
    ).length,
    "تعداد فایل صورت مالی حسابرسی شده": application.files.filter((file) =>
      file.fieldKey.startsWith("financials"),
    ).length,
    "تراز کل و معین تکمیل است": application.files.some((file) =>
      file.fieldKey.startsWith("trialBalance.generalLedger"),
    ) && application.files.some((file) => file.fieldKey.startsWith("trialBalance.subsidiaryLedger"))
      ? "بله"
      : "خیر",
    "گزارش‌های اعتبارسنجی تکمیل است": application.files.some((file) =>
      file.fieldKey.startsWith("creditReports.company"),
    ) && application.files.some((file) => file.fieldKey.startsWith("creditReports.ceo")) &&
    application.files.some((file) => file.fieldKey.startsWith("creditReports.boardMember"))
      ? "بله"
      : "خیر",
    "آخرین یادداشت مدیر": application.adminNote || "",
  };
}

export function createSubmissionsXlsx(rows: Record<string, unknown>[]) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Submissions");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function createSubmissionsCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(toCsvValue).join(","),
    ...rows.map((row) => headers.map((header) => toCsvValue(row[header])).join(",")),
  ];

  return `\uFEFF${lines.join("\n")}`;
}
