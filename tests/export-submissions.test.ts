import { describe, expect, it } from "vitest";
import {
  createSubmissionExportRow,
  createSubmissionsCsv,
  createSubmissionsXlsx,
} from "@/lib/export/submissions";

const files = [
  { fieldKey: "taxDeclarations.0.file" },
  { fieldKey: "financials.0.file" },
  { fieldKey: "humanResources.insuranceList" },
  { fieldKey: "trialBalance.generalLedger" },
  { fieldKey: "trialBalance.subsidiaryLedger" },
  { fieldKey: "creditReports.company" },
  { fieldKey: "creditReports.ceo" },
  { fieldKey: "creditReports.boardMember" },
];

describe("submission export", () => {
  it("creates HR-aware Persian export rows", () => {
    const row = createSubmissionExportRow({
      createdAt: new Date("2026-05-02T00:00:00.000Z"),
      submittedAt: new Date("2026-05-02T01:00:00.000Z"),
      status: "SUBMITTED",
      mobile: "09120000000",
      companyName: "شرکت آزمون",
      companyNationalId: "14000000000",
      companyContactFullName: "کاربر آزمون",
      companyContactNationalCode: "0012345678",
      taxDeclarations: [{ year: "1402", file: { fileId: "tax", name: "tax.pdf" } }],
      financials: [{ year: "1402", file: { fileId: "financial", name: "financial.pdf" } }],
      humanResources: {
        employeeCount: 12,
        insuranceList: { fileId: "insurance", name: "insurance.xlsx" },
      },
      adminNote: "یادداشت فارسی",
      payments: [{ status: "VERIFIED", referenceId: "REF-1" }],
      files,
    });

    expect(row["وضعیت"]).toBe("در صف بررسی");
    expect(row["تعداد نیروی انسانی"]).toBe(12);
    expect(row["لیست بیمه بارگذاری شده"]).toBe("بله");
    expect(row["اظهارنامه مالیاتی تکمیل است"]).toBe("بله");
    expect(row["صورت مالی حسابرسی شده تکمیل است"]).toBe("بله");
  });

  it("creates CSV with UTF-8 BOM for Excel", () => {
    const csv = createSubmissionsCsv([{ "نام شرکت": "شرکت آزمون" }]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("شرکت آزمون");
  });

  it("creates an XLSX workbook buffer", () => {
    const workbook = createSubmissionsXlsx([{ "نام شرکت": "شرکت آزمون" }]);

    expect(Buffer.isBuffer(workbook)).toBe(true);
    expect(workbook.length).toBeGreaterThan(0);
  });
});
