import * as XLSX from "xlsx";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  ApplicationStatus,
  FacilitiesAuditAction,
  FacilitiesPaymentStatus,
  Prisma,
} from "@prisma/client";

import { applicationStatusLabels } from "@/components/admin/StatusBadge";
import { paymentStatusLabels } from "@/components/admin/PaymentStatusBadge";
import { db } from "@/lib/db";
import { FACILITIES_REVIEW_VISIBLE_STATUSES } from "@/lib/facilities/review-status";

export const MAX_FACILITIES_EXPORT_APPLICATIONS = 5_000;
export const MAX_FACILITIES_EXPORT_ROWS = 100_000;
const EXPORT_CHUNK_SIZE = 250;
const IDENTIFIER = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1_000;

export type FacilitiesExportFilters = {
  intakeId?: string;
  supplierId?: string;
  status?: string;
  from?: string;
  to?: string;
};

export class FacilitiesExportError extends Error {
  constructor(message: string, public readonly status: 400 | 422) {
    super(message);
  }
}

export function parseTehranDateBoundary(value: string, nextDay = false) {
  const match = DATE_ONLY.exec(value);
  if (!match) throw new FacilitiesExportError("تاریخ باید با قالب YYYY-MM-DD وارد شود", 400);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const local = new Date(Date.UTC(year, month - 1, day));
  if (local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day) {
    throw new FacilitiesExportError("تاریخ واردشده معتبر نیست", 400);
  }
  if (nextDay) local.setUTCDate(local.getUTCDate() + 1);
  return new Date(local.getTime() - TEHRAN_OFFSET_MS);
}

export function validateFacilitiesExportFilters(filters: FacilitiesExportFilters) {
  for (const value of [filters.intakeId, filters.supplierId]) {
    if (value && !IDENTIFIER.test(value)) throw new FacilitiesExportError("شناسه فیلتر معتبر نیست", 400);
  }
  if (filters.status && !Object.values(ApplicationStatus).includes(filters.status as ApplicationStatus)) {
    throw new FacilitiesExportError("وضعیت انتخاب‌شده معتبر نیست", 400);
  }
  const from = filters.from ? parseTehranDateBoundary(filters.from) : undefined;
  const toExclusive = filters.to ? parseTehranDateBoundary(filters.to, true) : undefined;
  if (from && toExclusive && from >= toExclusive) throw new FacilitiesExportError("بازه تاریخ معتبر نیست", 400);
  return { from, toExclusive };
}

export function safeSpreadsheetText(value: unknown) {
  const text = String(value ?? "").normalize("NFC");
  return /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
}

function trustedAppUrl() {
  const raw = process.env.APP_URL;
  if (!raw) throw new Error("APP_URL_MISSING");
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("APP_URL_INVALID");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("APP_URL_INSECURE");
  return url.toString().replace(/\/$/, "");
}

function whereFor(filters: FacilitiesExportFilters): Prisma.FacilitiesApplicationWhereInput {
  const { from, toExclusive } = validateFacilitiesExportFilters(filters);
  return {
    ...(filters.intakeId ? { intakeId: filters.intakeId } : {}),
    ...(filters.supplierId ? { intakeSupplier: { supplierId: filters.supplierId } } : {}),
    ...(filters.status ? { status: filters.status as ApplicationStatus } : {}),
    ...((from || toExclusive) ? { createdAt: { ...(from ? { gte: from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) } } : {}),
  };
}

const exportInclude = {
  user: { select: { mobile: true } },
  companySnapshot: true,
  shareholders: { orderBy: { createdAt: "asc" as const } },
  officers: { orderBy: { createdAt: "asc" as const } },
  intake: { select: { id: true, name: true } },
  intakeSupplier: { select: { supplier: { select: { id: true, name: true } } } },
  questionnaireTemplateVersion: { select: { id: true, versionLabel: true } },
  evidence: { orderBy: [{ kind: "asc" as const }, { year: "asc" as const }] },
  fileBindings: {
    where: { scope: "APPLICATION" as const },
    orderBy: { slotKey: "asc" as const },
    select: { id: true, slotKey: true, currentUpload: { select: { revisionNumber: true, lifecycleStatus: true, storedFile: { select: { id: true, originalName: true, fileType: true, byteSize: true, scanStatus: true } } } } },
  },
  company: {
    select: { facilitiesFileBindings: {
      where: { scope: "COMPANY_PROFILE" as const },
      orderBy: { slotKey: "asc" as const },
      select: { id: true, slotKey: true, currentUpload: { select: { revisionNumber: true, lifecycleStatus: true, storedFile: { select: { id: true, originalName: true, fileType: true, byteSize: true, scanStatus: true } } } } },
    } },
  },
  payments: { orderBy: { createdAt: "asc" as const }, select: { id: true, amountToman: true, gateway: true, referenceId: true, status: true, safeMetadata: true, createdAt: true, updatedAt: true } },
  correctionRequests: { orderBy: { sequence: "asc" as const }, include: { reviewer: { select: { id: true, name: true } } } },
  history: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
} satisfies Prisma.FacilitiesApplicationInclude;

export type FacilitiesExportApplication = Prisma.FacilitiesApplicationGetPayload<{ include: typeof exportInclude }>;

export async function loadFacilitiesExportApplications(filters: FacilitiesExportFilters) {
  const where = whereFor(filters);
  const count = await db.facilitiesApplication.count({ where });
  if (count > MAX_FACILITIES_EXPORT_APPLICATIONS) {
    throw new FacilitiesExportError("تعداد پرونده‌ها بیش از حد مجاز است؛ فیلترها را محدودتر کنید", 422);
  }
  const selected = await db.facilitiesApplication.findMany({ where, select: { id: true, companyId: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const applicationIds = selected.map((item) => item.id);
  const companyIds = [...new Set(selected.map((item) => item.companyId))];
  const [shareholders, officers, annualDocuments, applicationFiles, payments, corrections, history, profileGroups] = applicationIds.length ? await Promise.all([
    db.facilitiesApplicationShareholder.count({ where: { applicationId: { in: applicationIds } } }),
    db.facilitiesApplicationOfficer.count({ where: { applicationId: { in: applicationIds } } }),
    db.facilitiesApplicationEvidence.count({ where: { applicationId: { in: applicationIds }, kind: { in: ["tax", "financial", "vat"] } } }),
    db.facilitiesFileBinding.count({ where: { applicationId: { in: applicationIds }, scope: "APPLICATION" } }),
    db.facilitiesPaymentAttempt.count({ where: { applicationId: { in: applicationIds } } }),
    db.facilitiesCorrectionRequest.count({ where: { applicationId: { in: applicationIds } } }),
    db.facilitiesStatusHistory.count({ where: { applicationId: { in: applicationIds } } }),
    db.facilitiesFileBinding.groupBy({ by: ["companyId"], where: { companyId: { in: companyIds }, scope: "COMPANY_PROFILE" }, _count: { _all: true } }),
  ]) : [0, 0, 0, 0, 0, 0, 0, []];
  const applicationsPerCompany = selected.reduce((map, item) => map.set(item.companyId, (map.get(item.companyId) ?? 0) + 1), new Map<string, number>());
  const profileFiles = profileGroups.reduce((sum, item) => sum + item._count._all * (item.companyId ? applicationsPerCompany.get(item.companyId) ?? 0 : 0), 0);
  const relatedRows = count + shareholders + officers + annualDocuments + applicationFiles + payments + corrections + history + profileFiles;
  if (relatedRows > MAX_FACILITIES_EXPORT_ROWS) throw new FacilitiesExportError("حجم جزئیات خروجی بیش از حد مجاز است؛ فیلترها را محدودتر کنید", 422);

  const applications: FacilitiesExportApplication[] = [];
  for (let offset = 0; offset < applicationIds.length; offset += EXPORT_CHUNK_SIZE) {
    const ids = applicationIds.slice(offset, offset + EXPORT_CHUNK_SIZE);
    const chunk = await db.facilitiesApplication.findMany({
      where: { id: { in: ids } },
      include: exportInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: ids.length,
    });
    applications.push(...chunk);
  }
  return { applications, relatedRows };
}

type WorkbookRows = Record<string, unknown>[];

const facilityTypeLabels = { FIXED_CAPITAL: "سرمایه ثابت", WORKING_CAPITAL: "سرمایه در گردش" } as const;
const actorTypeLabels: Record<string, string> = { USER: "کاربر", ADMIN: "مدیر", SYSTEM: "سامانه" };
const fileLifecycleLabels: Record<string, string> = { PENDING: "در انتظار", PASSED: "آماده", FAILED: "ناموفق", UNAVAILABLE: "موقتاً ناموجود", CORRUPT: "خراب", INTERRUPTED: "ناتمام", DUPLICATE: "تکراری", OVERSIZED: "بیش از حد مجاز", DISALLOWED: "غیرمجاز" };
const scanStatusLabels: Record<string, string> = { PENDING: "در انتظار", PASSED: "تأییدشده", FAILED: "ردشده" };
const smsStatusLabels: Record<string, string> = { PENDING: "در انتظار", SENT: "ارسال‌شده", FAILED: "ناموفق" };
const evidenceKindLabels: Record<string, string> = { questionnaire: "پرسشنامه", licences: "مجوزها و گواهی‌ها", "active-contracts": "قراردادهای فعال", insurance: "بیمه کارکنان", "trial-general": "تراز کل", "trial-subsidiary": "تراز معین", "credit-company": "گزارش اعتباری شرکت", "credit-ceo": "گزارش اعتباری مدیرعامل", "credit-board": "گزارش اعتباری عضو هیئت‌مدیره", vat: "اظهارنامه ارزش افزوده", tax: "اظهارنامه مالیاتی", financial: "صورت مالی حسابرسی‌شده" };
const yesNo = (value: boolean) => value ? "بله" : "خیر";
const text = (value: unknown) => safeSpreadsheetText(value);

function currentFileRows(application: FacilitiesExportApplication, appUrl: string) {
  const canLink = FACILITIES_REVIEW_VISIBLE_STATUSES.includes(application.status);
  const rows: WorkbookRows = [];
  for (const [scope, bindings] of [["درخواست", application.fileBindings], ["پروفایل شرکت", application.company.facilitiesFileBindings]] as const) {
    for (const binding of bindings) {
      const upload = binding.currentUpload;
      const file = upload?.storedFile;
      const evidence = application.evidence.find((item) => item.bindingId === binding.id);
      const associatedOfficer = evidence?.officerId ? application.officers.find((item) => item.id === evidence.officerId) : undefined;
      const ready = upload?.lifecycleStatus === "PASSED" && file?.scanStatus === "PASSED";
      const link = canLink && ready ? `${appUrl}/api/admin/facilities/applications/${encodeURIComponent(application.id)}/files/${encodeURIComponent(file.id)}` : "";
      rows.push({
        "شناسه درخواست": application.id,
        "دامنه": scope,
        "نوع منطقی": text(evidence?.kind ? evidenceKindLabels[evidence.kind] ?? (evidence.kind.startsWith("questionnaire-attachment") ? "پیوست پرسشنامه" : evidence.kind) : binding.slotKey.startsWith("questionnaire-attachment") ? "پیوست پرسشنامه" : evidenceKindLabels[binding.slotKey.replace(/-14\d{2}$/, "")] ?? binding.slotKey.replace(/-14\d{2}$/, "")),
        "کلید مدرک": text(binding.slotKey),
        "سال": evidence?.year ?? /^.*-(14\d{2})$/.exec(binding.slotKey)?.[1] ?? "",
        "عضو مرتبط": text(associatedOfficer?.fullName),
        "شناسه عضو مرتبط": associatedOfficer?.id ?? "",
        "نام فایل": text(file?.originalName),
        "نوع فایل": file?.fileType ?? "",
        "حجم (بایت)": file?.byteSize ?? "",
        "وضعیت چرخه": upload?.lifecycleStatus ? fileLifecycleLabels[upload.lifecycleStatus] ?? upload.lifecycleStatus : "",
        "وضعیت اسکن": file?.scanStatus ? scanStatusLabels[file.scanStatus] ?? file.scanStatus : "",
        "شماره بازبینی": upload?.revisionNumber ?? "",
        "پیوند دانلود": link,
      });
    }
  }
  return rows;
}

export function createFacilitiesWorkbookRows(applications: FacilitiesExportApplication[], appUrl = trustedAppUrl()) {
  const sheets: Record<string, WorkbookRows> = {
    "درخواست‌ها": [], "سهامداران": [], "اعضای شرکت": [], "مدارک سالانه": [], "فایل‌ها": [], "پرداخت‌ها": [], "اصلاحات": [], "تاریخچه وضعیت": [],
  };
  for (const application of applications) {
    const snapshot = application.companySnapshot;
    const boardEvidence = application.evidence.find((item) => item.kind === "credit-board");
    const selectedBoard = application.officers.find((item) => item.id === boardEvidence?.officerId);
    const employeeCount = application.evidence.find((item) => item.kind === "insurance")?.employeeCount;
    sheets["درخواست‌ها"].push({
      "شناسه درخواست": application.id, "تاریخ ایجاد": application.createdAt, "تاریخ آخرین تغییر": application.updatedAt,
      "تاریخ ارسال": application.submittedAt ?? "", "وضعیت": applicationStatusLabels[application.status] ?? application.status,
      "مرحله جاری": application.currentStep, "موبایل": text(application.user.mobile), "شناسه فراخوان": application.intake.id,
      "فراخوان": text(application.intake.name), "شناسه تأمین‌کننده": application.intakeSupplier.supplier.id,
      "تأمین‌کننده": text(application.intakeSupplier.supplier.name), "نوع تسهیلات": facilityTypeLabels[application.facilityType],
      "مبلغ درخواستی (ریال)": Number(application.requestedAmountRial), "سقف مبلغ هنگام ثبت (ریال)": Number(application.maximumAmountRialSnapshot),
      "پرداخت فعال هنگام ثبت": yesNo(application.paymentEnabledSnapshot), "مبلغ پرداخت هنگام ثبت (تومان)": application.paymentAmountTomanSnapshot ?? "",
      "نسخه شرایط پرداخت": text(application.paymentTermsVersionSnapshot), "شناسه نسخه پرسشنامه": application.questionnaireTemplateVersion.id,
      "نسخه پرسشنامه": text(application.questionnaireTemplateVersion.versionLabel), "تعداد کارکنان": employeeCount ?? "",
      "عضو منتخب هیئت‌مدیره": text(selectedBoard ? `${selectedBoard.fullName} — ${selectedBoard.position}` : ""),
      "نام شرکت": text(snapshot?.name), "شناسه ملی شرکت": text(snapshot?.nationalId), "شماره ثبت": text(snapshot?.registrationNumber),
      "محل ثبت": text(snapshot?.registrationPlace), "تاریخ ثبت": snapshot?.registrationDate ?? "", "سرمایه ثبت‌شده (ریال)": snapshot?.registeredCapitalRial ? Number(snapshot.registeredCapitalRial) : "",
      "نام رابط شرکت": text(snapshot?.contactFullName), "کد ملی رابط شرکت": text(snapshot?.contactNationalCode),
    });
    for (const item of application.shareholders) sheets["سهامداران"].push({ "شناسه درخواست": application.id, "نام سهامدار": text(item.fullName), "درصد مالکیت": Number(item.ownershipPercentage) });
    for (const item of application.officers) sheets["اعضای شرکت"].push({ "شناسه درخواست": application.id, "شناسه عضو": item.id, "نام": text(item.fullName), "سمت": text(item.position), "مدیرعامل": yesNo(item.isChiefExecutive), "منتخب گزارش اعتباری": yesNo(item.id === boardEvidence?.officerId) });
    for (const item of application.evidence.filter((e) => ["tax", "financial", "vat"].includes(e.kind))) sheets["مدارک سالانه"].push({ "شناسه درخواست": application.id, "نوع": item.kind === "tax" ? "اظهارنامه مالیاتی" : item.kind === "financial" ? "صورت مالی حسابرسی‌شده" : "اظهارنامه ارزش افزوده", "سال": item.year ?? "", "شناسه اتصال فایل": item.bindingId });
    sheets["فایل‌ها"].push(...currentFileRows(application, appUrl));
    for (const item of application.payments) {
      const safeMetadata = item.safeMetadata && !Array.isArray(item.safeMetadata) && typeof item.safeMetadata === "object" ? item.safeMetadata as Record<string, unknown> : {};
      sheets["پرداخت‌ها"].push({ "شناسه درخواست": application.id, "شناسه پرداخت": item.id, "تاریخ ایجاد": item.createdAt, "تاریخ آخرین تغییر": item.updatedAt, "مبلغ (تومان)": item.amountToman, "درگاه": text(item.gateway), "وضعیت": paymentStatusLabels[item.status] ?? item.status, "کد رهگیری": text(item.referenceId), "کد نتیجه امن": text(safeMetadata.reasonCode) });
    }
    for (const item of application.correctionRequests) sheets["اصلاحات"].push({ "شناسه درخواست": application.id, "شناسه اصلاح": item.id, "شماره": item.sequence, "کارشناس": text(item.reviewer.name), "شناسه کارشناس": item.reviewer.id, "یادداشت": text(item.note), "وضعیت پیامک": smsStatusLabels[item.smsStatus] ?? item.smsStatus, "تاریخ درخواست": item.openedAt, "تاریخ رفع": item.resolvedAt ?? "" });
    for (const item of application.history) sheets["تاریخچه وضعیت"].push({ "شناسه درخواست": application.id, "شناسه رویداد": item.id, "وضعیت قبلی": item.previousStatus ? applicationStatusLabels[item.previousStatus] ?? item.previousStatus : "", "وضعیت جدید": applicationStatusLabels[item.newStatus] ?? item.newStatus, "نوع عامل": actorTypeLabels[item.actorType] ?? item.actorType, "شناسه عامل": text(item.actorId), "یادداشت": text(item.note), "تاریخ": item.createdAt });
  }
  return sheets;
}

export function createFacilitiesXlsx(applications: FacilitiesExportApplication[], appUrl?: string) {
  const rows = createFacilitiesWorkbookRows(applications, appUrl);
  const workbook = XLSX.utils.book_new();
  for (const [name, sheetRows] of Object.entries(rows)) {
    const worksheet = XLSX.utils.json_to_sheet(sheetRows.length ? sheetRows : [{ "شناسه درخواست": "" }], { cellDates: true, dateNF: "yyyy-mm-dd hh:mm" });
    const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1:A1");
    worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: range.s, e: { r: 0, c: range.e.c } }) };
    worksheet["!cols"] = Array.from({ length: range.e.c + 1 }, (_, index) => ({ wch: index === 0 ? 28 : 20 }));
    if (name === "فایل‌ها") {
      const headers = sheetRows.length ? Object.keys(sheetRows[0]) : ["شناسه درخواست"];
      const linkColumn = headers.indexOf("پیوند دانلود");
      if (linkColumn >= 0) for (let row = 1; row <= sheetRows.length; row += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: linkColumn });
        const target = sheetRows[row - 1]["پیوند دانلود"];
        if (typeof target === "string" && target) worksheet[address].l = { Target: target, Tooltip: "دانلود با ورود مدیر" };
      }
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  }
  const generated = XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellDates: true }) as Buffer;
  const archive = unzipSync(generated);
  for (const [path, bytes] of Object.entries(archive)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(path)) continue;
    const xml = strFromU8(bytes);
    archive[path] = strToU8(xml.replace(
      /<sheetViews>[\s\S]*?<\/sheetViews>/,
      '<sheetViews><sheetView workbookViewId="0" rightToLeft="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>',
    ));
  }
  return Buffer.from(zipSync(archive, { level: 6 }));
}

export async function getFacilitiesExportOptions() {
  const [intakes, suppliers] = await Promise.all([
    db.facilityIntake.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } }),
    db.facilitySupplier.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
  ]);
  return { intakes, suppliers, statuses: Object.values(ApplicationStatus) };
}

export const facilitiesExportAuditAction = FacilitiesAuditAction.EXPORT_SUCCEEDED;
export const facilitiesPaymentStatuses = Object.values(FacilitiesPaymentStatus);
