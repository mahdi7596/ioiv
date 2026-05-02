import * as XLSX from "xlsx";
import { ApplicationStatus } from "@prisma/client";
import { db } from "@/lib/db";

type ExportFilters = {
  q?: string;
  status?: string;
  sort?: string;
};

function toCsvValue(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
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

  return applications.map((application) => {
    const latestPayment = application.payments[0];

    return {
      "Created Date": application.createdAt.toISOString(),
      "Submitted Date": application.submittedAt?.toISOString() || "",
      Status: application.status,
      Mobile: application.mobile,
      "Company Name": application.companyName || "",
      "Company National ID": application.companyNationalId,
      "Company Contact Full Name": application.companyContactFullName || "",
      "Company Contact National Code": application.companyContactNationalCode || "",
      "Payment Status": latestPayment?.status || "",
      "Payment Reference ID": latestPayment?.referenceId || "",
      "Tax Declaration Files": application.files.filter((file) =>
        file.fieldKey.startsWith("taxDeclarations"),
      ).length,
      "Audited Financial Files": application.files.filter((file) =>
        file.fieldKey.startsWith("financials"),
      ).length,
      "Trial Balance Complete": application.files.some((file) =>
        file.fieldKey.startsWith("trialBalance.generalLedger"),
      ) && application.files.some((file) => file.fieldKey.startsWith("trialBalance.subsidiaryLedger"))
        ? "yes"
        : "no",
      "Credit Reports Complete": application.files.some((file) =>
        file.fieldKey.startsWith("creditReports.company"),
      ) && application.files.some((file) => file.fieldKey.startsWith("creditReports.ceo")) &&
      application.files.some((file) => file.fieldKey.startsWith("creditReports.boardMember"))
        ? "yes"
        : "no",
      "Latest Admin Note": application.adminNote || "",
    };
  });
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

  return lines.join("\n");
}
