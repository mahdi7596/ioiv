import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/AppShell";
import { facilitiesAuditFilterOptions, listFacilitiesAudit, type FacilitiesAuditFilters } from "@/lib/actions/facilities-audit";
import { getFacilitiesAdminAccess } from "@/lib/admin/facilities-access";
import { getSession } from "@/lib/auth/session";

const actionLabels: Record<string, string> = {
  COMPANY_CREATED: "ایجاد شرکت", COMPANY_UPDATED: "ویرایش شرکت", COMPANY_DOCUMENT_REPLACED: "جایگزینی مدرک شرکت",
  PROGRAMME_CONFIGURED: "تنظیم برنامه", INTAKE_CONFIGURED: "تنظیم فراخوان", SUPPLIER_CONFIGURED: "تنظیم تأمین‌کننده", QUESTIONNAIRE_TEMPLATE_CONFIGURED: "تنظیم الگوی پرسشنامه",
  APPLICATION_CREATED: "ایجاد درخواست", APPLICATION_UPDATED: "ویرایش درخواست", APPLICATION_SUBMITTED: "ارسال درخواست",
  PAYMENT_INITIATED: "آغاز پرداخت", PAYMENT_REDIRECT_READY: "آماده‌سازی انتقال پرداخت", PAYMENT_PENDING: "پرداخت در انتظار", PAYMENT_VERIFIED: "تأیید پرداخت", PAYMENT_FAILED: "پرداخت ناموفق", PAYMENT_CANCELLED: "لغو پرداخت", PAYMENT_TIMED_OUT: "پایان مهلت پرداخت",
  CORRECTION_REQUESTED: "درخواست اصلاح", CORRECTION_SUBMITTED: "ارسال اصلاحات", CORRECTION_SMS_SENT: "ارسال پیامک اصلاح", CORRECTION_SMS_FAILED: "خطای پیامک اصلاح", STATUS_CHANGED: "تغییر وضعیت",
  FILE_ATTACHED: "اتصال فایل", FILE_REPLACED: "جایگزینی فایل", EXPORT_SUCCEEDED: "خروجی موفق", EXPORT_FAILED: "خروجی ناموفق", AUDIT_VIEWED: "مشاهده ممیزی", FILE_DOWNLOADED: "دانلود فایل", QUESTIONNAIRE_DOWNLOADED: "دانلود پرسشنامه", RECONCILIATION_COMPLETED: "تطبیق فایل‌ها", QUARANTINE_EXPIRED: "پایان نگهداری قرنطینه",
};
const outcomeLabels: Record<string, string> = { SUCCEEDED: "موفق", FAILED: "ناموفق", REJECTED: "ردشده" };
const actorLabels: Record<string, string> = { USER: "کاربر", ADMIN: "مدیر", SYSTEM: "سامانه" };

export default async function FacilitiesAuditPage({ searchParams }: { searchParams: Promise<FacilitiesAuditFilters> }) {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  if (session.kind !== "admin") return <main className="shell"><section className="panel" role="alert"><h1>دسترسی مجاز نیست</h1><p>مشاهده رویدادهای ممیزی فقط برای مدیر ارشد فعال است.</p></section></main>;
  const access = await getFacilitiesAdminAccess();
  if (!access.permissions.viewFacilitiesAudit) return <main className="shell"><section className="panel" role="alert"><h1>دسترسی مجاز نیست</h1><p>مشاهده رویدادهای ممیزی فقط برای مدیر ارشد فعال است.</p><Link className="button button--ghost" href="/admin/facilities/applications">بازگشت</Link></section></main>;
  const filters = await searchParams;
  const result = await listFacilitiesAudit(filters);
  const next = new URLSearchParams(Object.entries({ ...filters, cursor: result.nextCursor ?? undefined }).filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1])));
  return <AppShell area="admin" eyebrow="امنیت و عملیات" title="رویدادهای ممیزی تسهیلات" description="مشاهده محافظت‌شده رویدادهای تغییر، خروجی، دانلود و بازیابی." action={<Link className="button button--ghost" href="/admin/facilities/applications"><ArrowRight aria-hidden="true" size={19} />بازگشت</Link>}>
    <form className="panel filters" action="/admin/facilities/audit">
      <label>از تاریخ<input type="date" name="from" defaultValue={filters.from || ""} /></label><label>تا تاریخ<input type="date" name="to" defaultValue={filters.to || ""} /></label>
      <label>رویداد<select name="action" defaultValue={filters.action || ""}><option value="">همه</option>{facilitiesAuditFilterOptions.actions.map((value) => <option key={value} value={value}>{actionLabels[value] || value}</option>)}</select></label>
      <label>نتیجه<select name="outcome" defaultValue={filters.outcome || ""}><option value="">همه</option>{facilitiesAuditFilterOptions.outcomes.map((value) => <option key={value} value={value}>{outcomeLabels[value] || value}</option>)}</select></label>
      <label>نوع عامل<select name="actorType" defaultValue={filters.actorType || ""}><option value="">همه</option>{facilitiesAuditFilterOptions.actorTypes.map((value) => <option key={value} value={value}>{actorLabels[value] || value}</option>)}</select></label>
      <label>شناسه پرونده<input name="applicationId" dir="ltr" defaultValue={filters.applicationId || ""} /></label><label>شناسه موجودیت<input name="entityId" dir="ltr" defaultValue={filters.entityId || ""} /></label><label>شناسه درخواست<input name="requestId" dir="ltr" defaultValue={filters.requestId || ""} /></label>
      <button className="button button--primary">اعمال فیلتر</button>
    </form>
    <section className="panel table-wrap" aria-label="فهرست رویدادهای ممیزی">
      {result.rows.length ? <table className="data-table text-sm"><thead><tr><th>زمان</th><th>رویداد</th><th>نتیجه</th><th>عامل</th><th>پرونده / موجودیت</th><th>جزئیات امن</th><th>شناسه درخواست</th></tr></thead><tbody>{result.rows.map((row) => <tr key={row.id}><td>{row.createdAt.toLocaleString("fa-IR")}</td><td>{actionLabels[row.action] || row.action}</td><td>{outcomeLabels[row.outcome] || row.outcome}</td><td>{actorLabels[row.actorType] || row.actorType}<small dir="ltr">{row.actorId || "-"}</small></td><td>{row.applicationId ? <><Link href={`/admin/facilities/applications/${row.applicationId}`} dir="ltr">{row.applicationId}</Link><small dir="ltr">{row.entityType}: {row.entityId || "-"}</small></> : <span dir="ltr">{row.entityType}: {row.entityId || "-"}</span>}</td><td><code dir="ltr">{JSON.stringify(row.metadata)}</code>{row.ipAddress ? <small dir="ltr">IP: {row.ipAddress}</small> : null}{row.userAgent ? <small dir="ltr">UA: {row.userAgent}</small> : null}</td><td><small dir="ltr">{row.requestId || "-"}</small></td></tr>)}</tbody></table> : <p role="status">رویدادی مطابق فیلترهای انتخابی پیدا نشد.</p>}
    </section>
    {result.nextCursor ? <Link className="button button--ghost" href={`/admin/facilities/audit?${next.toString()}`}>صفحه بعد</Link> : null}
  </AppShell>;
}
