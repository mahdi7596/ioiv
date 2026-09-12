import Link from "next/link";
import { ArrowRight, Download } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { FacilitiesReviewActions } from "@/components/admin/FacilitiesReviewActions";
import { PaymentStatusBadge } from "@/components/admin/PaymentStatusBadge";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { StatusHistoryTimeline } from "@/components/admin/StatusHistoryTimeline";
import { AppShell } from "@/components/layout/AppShell";
import { getFacilitiesReview } from "@/lib/actions/facilities-review";
import { getSession } from "@/lib/auth/session";

const slotLabels: Record<string, string> = {
  "profile-incorporation-notice": "آگهی تأسیس", "profile-articles-of-association": "اساسنامه", "profile-board-changes-gazette": "روزنامه تغییرات هیئت‌مدیره", "profile-capital-increase-gazette": "روزنامه افزایش سرمایه",
  questionnaire: "پرسشنامه تکمیل‌شده", licences: "مجوزها و گواهی‌ها", "active-contracts": "قراردادهای فعال", insurance: "لیست بیمه", "trial-general": "تراز کل ۱۴۰۵", "trial-subsidiary": "تراز معین ۱۴۰۵", "credit-company": "گزارش اعتباری شرکت", "credit-ceo": "گزارش اعتباری مدیرعامل", "credit-board": "گزارش اعتباری عضو هیئت‌مدیره",
};

function EvidenceList({ applicationId, bindings, canDownload }: { applicationId: string; bindings: Array<{ id: string; slotKey: string; currentUpload: { lifecycleStatus: string; storedFile: { id: string; originalName: string; fileType: string; byteSize: number; scanStatus: string } | null } | null }>; canDownload: boolean }) {
  const ready = bindings.filter((binding) => binding.currentUpload?.lifecycleStatus === "PASSED" && binding.currentUpload.storedFile?.scanStatus === "PASSED");
  return ready.length ? <ul className="file-list">{ready.map((binding) => { const file = binding.currentUpload!.storedFile!; return <li key={binding.id}><div><strong>{slotLabels[binding.slotKey] || (binding.slotKey.startsWith("officer-") ? "بسته هویتی عضو" : binding.slotKey)}</strong><small>{file.originalName} — {Math.ceil(file.byteSize / 1024)} کیلوبایت</small></div>{canDownload ? <a className="button button--ghost" href={`/api/admin/facilities/applications/${applicationId}/files/${file.id}`}><Download aria-hidden="true" size={17} />دانلود</a> : <span className="text-sm text-stone-500">مشاهده فقط</span>}</li>; })}</ul> : <p role="status">مدرک بررسی‌شده‌ای ثبت نشده است.</p>;
}

export default async function FacilitiesReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/admin/login");
  if (session.kind !== "admin") throw new Error("FACILITIES_ADMIN_FORBIDDEN");
  const result = await getFacilitiesReview(id);
  if (!result) notFound();
  const { application, permissions } = result;
  const failedCorrection = application.correctionRequests.find((item) => item.smsStatus === "FAILED");
  const latestPayment = application.payments[0];
  const employeeEvidence = application.evidence.find((item) => item.kind === "insurance");
  const boardEvidence = application.evidence.find((item) => item.kind === "credit-board");
  const selectedBoardOfficer = application.officers.find((item) => item.id === boardEvidence?.officerId);
  return <AppShell area="admin" eyebrow="جزئیات تسهیلات" title={application.companySnapshot?.name || "پرونده تسهیلات"} description="اطلاعات، مدارک خصوصی، پرداخت و چرخه‌های اصلاح پرونده." action={<Link className="button button--ghost" href="/admin/facilities/applications"><ArrowRight aria-hidden="true" size={19} />بازگشت</Link>}>
    <section className="panel detail-grid">
      <div><p className="stat-label">وضعیت</p><StatusBadge status={application.status} /></div><div><p className="stat-label">شناسه ملی</p><p dir="ltr">{application.companySnapshot?.nationalId || "-"}</p></div><div><p className="stat-label">موبایل</p><p dir="ltr">{application.user.mobile}</p></div><div><p className="stat-label">فراخوان</p><p>{application.intake.name}</p></div><div><p className="stat-label">تأمین‌کننده</p><p>{application.intakeSupplier.supplier.name}</p></div><div><p className="stat-label">نسخه پرسشنامه</p><p>{application.questionnaireTemplateVersion.versionLabel}</p></div><div><p className="stat-label">نوع تسهیلات</p><p>{application.facilityType === "FIXED_CAPITAL" ? "سرمایه ثابت" : "سرمایه در گردش"}</p></div><div><p className="stat-label">مبلغ درخواستی</p><p>{application.requestedAmountRial.toString()} ریال</p></div><div><p className="stat-label">تعداد کارکنان</p><p>{employeeEvidence?.employeeCount ?? "-"}</p></div><div><p className="stat-label">عضو منتخب هیئت‌مدیره</p><p>{selectedBoardOfficer ? `${selectedBoardOfficer.fullName} — ${selectedBoardOfficer.position}` : "-"}</p></div><div><p className="stat-label">پرداخت</p><PaymentStatusBadge status={latestPayment?.status} /></div><div><p className="stat-label">نتیجه درگاه</p><p>{latestPayment ? `${latestPayment.gateway} — ${latestPayment.amountToman.toLocaleString("fa-IR")} تومان` : "بدون پرداخت"}</p><small dir="ltr">{latestPayment?.referenceId || "-"}</small></div>
    </section>
    <section className="panel"><h2>اطلاعات ثبت‌شده شرکت</h2><div className="detail-grid"><div><p className="stat-label">شماره ثبت</p><p>{application.companySnapshot?.registrationNumber || "-"}</p></div><div><p className="stat-label">محل ثبت</p><p>{application.companySnapshot?.registrationPlace || "-"}</p></div><div><p className="stat-label">سرمایه ثبت‌شده</p><p>{application.companySnapshot?.registeredCapitalRial?.toString() || "-"} ریال</p></div><div><p className="stat-label">رابط شرکت</p><p>{application.companySnapshot?.contactFullName || "-"}</p></div></div><h3>سهامداران</h3><ul>{application.shareholders.map((item) => <li key={item.id}>{item.fullName} — {item.ownershipPercentage.toString()}٪</li>)}</ul><h3>مدیرعامل و اعضا</h3><ul>{application.officers.map((item) => <li key={item.id}>{item.fullName} — {item.position}</li>)}</ul></section>
    <section className="panel"><h2>مدارک جاری پروفایل شرکت</h2><EvidenceList applicationId={application.id} bindings={application.company.facilitiesFileBindings} canDownload={permissions.canDownload} /></section>
    <section className="panel"><h2>مدارک درخواست</h2><EvidenceList applicationId={application.id} bindings={application.fileBindings} canDownload={permissions.canDownload} /></section>
    <section className="panel"><h2>چرخه‌های اصلاح</h2>{application.correctionRequests.length ? <ol className="facilities-timeline">{application.correctionRequests.map((item) => <li key={item.id}><strong>اصلاح شماره {item.sequence}</strong><span>{item.openedAt.toLocaleString("fa-IR")} — {item.resolvedAt ? "ارسال‌شده" : "باز"}</span><p>{item.note}</p><small>کارشناس: {item.reviewer.name} — پیامک: {item.smsStatus === "SENT" ? "ارسال شد" : item.smsStatus === "FAILED" ? "ناموفق" : "در انتظار"}</small></li>)}</ol> : <p>درخواست اصلاحی ثبت نشده است.</p>}</section>
    <section className="panel"><h2>سوابق وضعیت</h2><StatusHistoryTimeline items={application.history} /></section>
    {permissions.canMutate ? <FacilitiesReviewActions applicationId={application.id} status={application.status} failedCorrectionId={failedCorrection?.id} /> : <section className="panel" role="status">دسترسی شما برای مشاهده این پرونده فقط خواندنی است.</section>}
  </AppShell>;
}
