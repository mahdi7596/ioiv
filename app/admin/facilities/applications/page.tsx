import Link from "next/link";
import { ArrowRight, Download, Eye, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { applicationStatusLabels, StatusBadge } from "@/components/admin/StatusBadge";
import { AppShell } from "@/components/layout/AppShell";
import { listFacilitiesReviews } from "@/lib/actions/facilities-review";
import { getSession } from "@/lib/auth/session";
import { getFacilitiesAdminAccess } from "@/lib/admin/facilities-access";
import { getFacilitiesExportOptions } from "@/lib/export/facilities";

export default async function FacilitiesApplicationsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const filters = await searchParams;
  const session = await getSession();
  if (!session) redirect("/admin/login");
  if (session.kind !== "admin") throw new Error("FACILITIES_ADMIN_FORBIDDEN");
  const [applications, access, exportOptions] = await Promise.all([listFacilitiesReviews(filters), getFacilitiesAdminAccess(), getFacilitiesExportOptions()]);
  return <AppShell area="admin" eyebrow="بررسی تسهیلات" title="پرونده‌های تسهیلات" description="صف مستقل بررسی درخواست‌های تسهیلات و اصلاحات متقاضیان." action={<Link className="button button--ghost" href="/admin"><ArrowRight aria-hidden="true" size={19} />بازگشت</Link>}>
    <form className="panel filters" action="/admin/facilities/applications">
      <label>جستجو<input name="q" defaultValue={filters.q || ""} placeholder="نام شرکت، موبایل یا شناسه ملی" /></label>
      <label>وضعیت<select name="status" defaultValue={filters.status || ""}><option value="">همه وضعیت‌ها</option><option value="SUBMITTED">در صف بررسی</option><option value="UNDER_REVIEW">در حال بررسی</option><option value="NEEDS_EDIT">نیازمند اصلاح</option><option value="VALIDATION_COMPLETED">پایان اعتبارسنجی</option></select></label>
      <button className="button button--primary">اعمال فیلتر</button>
    </form>
    {access.permissions.exportFacilitiesApplications ? <form className="panel filters" action="/api/admin/facilities/export" method="get" aria-label="خروجی اکسل درخواست‌های تسهیلات">
      <label>فراخوان<select name="intakeId" defaultValue=""><option value="">همه فراخوان‌ها</option>{exportOptions.intakes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>تأمین‌کننده<select name="supplierId" defaultValue=""><option value="">همه تأمین‌کنندگان</option>{exportOptions.suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>وضعیت<select name="status" defaultValue=""><option value="">همه وضعیت‌ها</option>{exportOptions.statuses.map((value) => <option key={value} value={value}>{applicationStatusLabels[value]}</option>)}</select></label>
      <label>از تاریخ ایجاد<input type="date" name="from" /></label><label>تا تاریخ ایجاد<input type="date" name="to" /></label>
      <button className="button button--primary"><Download aria-hidden="true" size={18} />خروجی Excel</button>
      {access.permissions.viewFacilitiesAudit ? <Link className="button button--ghost" href="/admin/facilities/audit"><ShieldCheck aria-hidden="true" size={18} />رویدادهای ممیزی</Link> : null}
    </form> : null}
    <div className="panel table-wrap">
      {applications.length ? <table className="data-table text-sm"><thead><tr><th>شرکت</th><th>موبایل</th><th>تأمین‌کننده</th><th>وضعیت</th><th>آخرین فعالیت</th><th>جزئیات</th></tr></thead><tbody>{applications.map((application) => <tr key={application.id}><td><strong>{application.companySnapshot?.name || "-"}</strong><small dir="ltr">{application.companySnapshot?.nationalId || "-"}</small></td><td dir="ltr">{application.user.mobile}</td><td>{application.intakeSupplier.supplier.name}</td><td><StatusBadge status={application.status} />{application.correctionRequests[0]?.smsStatus === "FAILED" ? <small className="form-error">پیامک ناموفق</small> : null}</td><td>{application.updatedAt.toLocaleString("fa-IR")}</td><td><Link className="icon-button" href={`/admin/facilities/applications/${application.id}`} aria-label={`مشاهده پرونده ${application.companySnapshot?.nationalId || ""}`}><Eye aria-hidden="true" size={18} /></Link></td></tr>)}</tbody></table> : <p role="status">پرونده‌ای مطابق فیلترهای انتخابی پیدا نشد.</p>}
    </div>
  </AppShell>;
}
