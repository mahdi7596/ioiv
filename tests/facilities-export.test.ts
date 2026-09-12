import * as XLSX from "xlsx";
import { writeFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { ApplicationStatus, Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { createFacilitiesWorkbookRows, createFacilitiesXlsx, parseTehranDateBoundary, safeSpreadsheetText, validateFacilitiesExportFilters, type FacilitiesExportApplication } from "@/lib/export/facilities";

function application(status: ApplicationStatus, id: string): FacilitiesExportApplication {
  const file = { id: `file-${id}`, originalName: "=danger.xlsx", fileType: "XLSX" as const, byteSize: 123, scanStatus: "PASSED" as const };
  return {
    id, userId: "user-1", companyId: "company-1", intakeId: "intake-1", intakeSupplierId: "offer-1", questionnaireTemplateVersionId: "template-1",
    facilityType: "FIXED_CAPITAL", requestedAmountRial: new Prisma.Decimal("500000000000"), maximumAmountRialSnapshot: new Prisma.Decimal("500000000000"), paymentEnabledSnapshot: true, paymentAmountTomanSnapshot: 3000000, paymentTermsVersionSnapshot: "v1", status, currentStep: 8,
    submittedAt: status === ApplicationStatus.DRAFT ? null : new Date("2026-09-12T09:00:00Z"), createdAt: new Date("2026-09-12T08:00:00Z"), updatedAt: new Date("2026-09-12T10:00:00Z"),
    user: { mobile: "09120000000" }, intake: { id: "intake-1", name: "فراخوان اول" }, intakeSupplier: { supplier: { id: "supplier-1", name: "شرکت ملی نفت ایران" } }, questionnaireTemplateVersion: { id: "template-1", versionLabel: "نسخه ۱" },
    companySnapshot: { id: "snapshot-1", applicationId: id, name: "=شرکت", nationalId: "14000000000", registrationNumber: "1", registrationPlace: "تهران", registrationDate: new Date("2020-01-01Z"), registeredCapitalRial: new Prisma.Decimal(1000), contactFullName: "+رابط", contactNationalCode: "0012345678", createdAt: new Date("2026-09-12Z") },
    shareholders: [{ id: "share-1", applicationId: id, fullName: "سهامدار", ownershipPercentage: new Prisma.Decimal(100), createdAt: new Date("2026-09-12Z") }],
    officers: [{ id: "officer-1", applicationId: id, sourceCompanyOfficerId: "source-1", fullName: "مدیر", position: "مدیرعامل", isChiefExecutive: true, createdAt: new Date("2026-09-12Z") }],
    evidence: [{ id: "evidence-1", applicationId: id, bindingId: "binding-1", kind: "tax", year: 1404, officerId: null, employeeCount: null, createdAt: new Date("2026-09-12Z"), updatedAt: new Date("2026-09-12Z") }],
    fileBindings: [{ id: "binding-1", slotKey: "tax-1404", currentUpload: { revisionNumber: 1, lifecycleStatus: "PASSED", storedFile: file } }],
    company: { facilitiesFileBindings: [{ id: "profile-binding", slotKey: "profile-incorporation-notice", currentUpload: { revisionNumber: 2, lifecycleStatus: "PASSED", storedFile: { ...file, id: `profile-${id}` } } }] },
    payments: [{ id: "pay-1", amountToman: 3000000, gateway: "zarinpal", referenceId: "ref-1", status: "VERIFIED", safeMetadata: { status: "VERIFIED" }, createdAt: new Date("2026-09-12Z"), updatedAt: new Date("2026-09-12Z") }],
    correctionRequests: [{ id: "correction--1", applicationId: id, sequence: 1, reviewerId: "admin-1", note: "اصلاح شود", openedAt: new Date("2026-09-12Z"), resolvedAt: null, smsStatus: "SENT", smsAttemptCount: 1, smsLastAttemptAt: null, smsSentAt: null, smsFailureCode: null, reviewer: { id: "admin-1", name: "مدیر" } }],
    history: [{ id: "history-1", applicationId: id, previousStatus: null, newStatus: status, actorType: "USER", actorId: "user-1", note: "ایجاد", createdAt: new Date("2026-09-12Z") }],
  } as unknown as FacilitiesExportApplication;
}

describe("facilities export", () => {
  it("uses inclusive Tehran date boundaries and validates filters", () => {
    expect(parseTehranDateBoundary("2026-09-12").toISOString()).toBe("2026-09-11T20:30:00.000Z");
    expect(parseTehranDateBoundary("2026-09-12", true).toISOString()).toBe("2026-09-12T20:30:00.000Z");
    expect(() => validateFacilitiesExportFilters({ status: "NOPE" })).toThrow("وضعیت");
    expect(() => validateFacilitiesExportFilters({ from: "2026-09-13", to: "2026-09-12" })).toThrow("بازه");
  });

  it("neutralizes formula-like text", () => {
    for (const value of ["=SUM(1,1)", "+cmd", "-2+3", "@danger"]) expect(safeSpreadsheetText(value)).toBe(`'${value}`);
    expect(safeSpreadsheetText("شرکت امن")).toBe("شرکت امن");
  });

  it("creates all related sheets and omits draft links", () => {
    const submitted = application(ApplicationStatus.SUBMITTED, "submitted");
    submitted.fileBindings.push({ id: "attachment-binding", slotKey: "questionnaire-attachment-safeid", currentUpload: { revisionNumber: 1, lifecycleStatus: "PASSED", storedFile: { id: "attachment-file", originalName: "پیوست.pdf", fileType: "PDF", byteSize: 456, scanStatus: "PASSED" } } });
    submitted.evidence.push({ id: "attachment-evidence", applicationId: submitted.id, bindingId: "attachment-binding", kind: "questionnaire-attachment-safeid", year: null, officerId: null, employeeCount: null, createdAt: new Date("2026-09-12Z"), updatedAt: new Date("2026-09-12Z") });
    const draft = application(ApplicationStatus.DRAFT, "draft");
    draft.intake = { id: "intake-2", name: "فراخوان دوم" };
    draft.intakeSupplier = { supplier: { id: "supplier-2", name: "تأمین‌کننده دوم" } };
    draft.createdAt = new Date("2026-08-20T08:00:00Z");
    const rows = createFacilitiesWorkbookRows([submitted, draft], "https://sana.ioiv.ir");
    expect(Object.keys(rows)).toEqual(["درخواست‌ها", "سهامداران", "اعضای شرکت", "مدارک سالانه", "فایل‌ها", "پرداخت‌ها", "اصلاحات", "تاریخچه وضعیت"]);
    expect(rows["درخواست‌ها"][0]["نام شرکت"]).toBe("'=شرکت");
    expect(rows["فایل‌ها"].filter((row) => row["شناسه درخواست"] === "submitted").every((row) => String(row["پیوند دانلود"]).startsWith("https://sana.ioiv.ir/api/admin/facilities/applications/submitted/files/"))).toBe(true);
    expect(rows["فایل‌ها"].filter((row) => row["شناسه درخواست"] === "draft").every((row) => row["پیوند دانلود"] === "")).toBe(true);
    expect(rows["فایل‌ها"][0]).toMatchObject({ "نوع منطقی": "اظهارنامه مالیاتی", "سال": 1404, "وضعیت چرخه": "آماده", "وضعیت اسکن": "تأییدشده" });
    expect(rows["فایل‌ها"]).toContainEqual(expect.objectContaining({ "کلید مدرک": "questionnaire-attachment-safeid", "نوع منطقی": "پیوست پرسشنامه" }));
    expect(JSON.stringify(rows)).not.toMatch(/storageKey|sha256|authority|merchant|secret/i);
    const output = createFacilitiesXlsx([submitted, draft], "https://sana.ioiv.ir");
    if (process.env.M8_SMOKE_OUTPUT) writeFileSync(process.env.M8_SMOKE_OUTPUT, output);
    const workbook = XLSX.read(output, { type: "buffer", cellDates: true });
    expect(workbook.SheetNames).toEqual(Object.keys(rows));
    expect(workbook.Sheets["فایل‌ها"]["N2"].l?.Target).toContain("/applications/submitted/files/");
    const firstSheetXml = strFromU8(unzipSync(output)["xl/worksheets/sheet1.xml"]);
    expect(firstSheetXml).toContain('rightToLeft="1"');
    expect(firstSheetXml).toContain('state="frozen"');
    expect(firstSheetXml).toContain('topLeftCell="A2"');
    for (const sheet of Object.values(workbook.Sheets)) for (const cell of Object.values(sheet)) {
      if (cell && typeof cell === "object" && "f" in cell) expect(cell.f).toBeUndefined();
    }
  });

  it("produces a valid related workbook for an empty result set", () => {
    const workbook = XLSX.read(createFacilitiesXlsx([], "https://sana.ioiv.ir"), { type: "buffer" });
    expect(workbook.SheetNames).toHaveLength(8);
    expect(workbook.Sheets["درخواست‌ها"]["A1"].v).toBe("شناسه درخواست");
  });
});
