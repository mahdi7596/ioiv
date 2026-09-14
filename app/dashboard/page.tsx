import Link from "next/link";
import { Building2, MessageSquareWarning } from "lucide-react";
import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DashboardEvaluationNotice } from "@/components/dashboard/DashboardEvaluationNotice";
import { ValidationCertificateDownload } from "@/components/dashboard/ValidationCertificateDownload";
import { AppShell } from "@/components/layout/AppShell";
import { canEditApplication } from "@/lib/application/status";
import { isFacilitiesApplicationEditable } from "@/lib/facilities/review-status";
import { getCurrentUserApplication } from "@/lib/actions/application";
import { getFacilitiesDashboardSummary, hasCompletedFacilitiesProfile } from "@/lib/actions/facilities-company";

type ServiceRow = {
  key: string;
  index: string;
  title: string;
  fullTitle: string;
  href: string;
  status: string | null;
  editable: boolean;
};

export default async function DashboardPage() {
  let data: Awaited<ReturnType<typeof getCurrentUserApplication>>;

  try {
    data = await getCurrentUserApplication();
  } catch {
    // The session cookie is a self-contained JWT, so it can stay valid after
    // the underlying user is gone (e.g. the DB was reseeded). Redirecting to
    // "/" would bounce straight back here because "/" trusts the cookie, so
    // clear the cookie via the logout route to break the redirect loop.
    redirect("/api/auth/logout");
  }

  if (!(await hasCompletedFacilitiesProfile())) {
    redirect("/dashboard/facilities-profile");
  }

  const { application } = data;
  const facilitiesSummary = await getFacilitiesDashboardSummary();
  const validationCertificate = application?.files[0];
  const hasActiveEditRequest = application?.status === "NEEDS_EDIT";

  const rows: ServiceRow[] = [
    {
      key: "validation",
      index: "۱",
      title: "اعتبارسنجی تأمین‌کنندگان",
      fullTitle: "اعتبارسنجی شرکت‌های متقاضی ورود به لیست بلند تأمین‌کنندگان وزارت نفت",
      href: "/dashboard/application",
      status: application?.status ?? null,
      editable: application ? canEditApplication(application.status) : true,
    },
    {
      key: "facilities",
      index: "۲",
      title: "تسهیلات ماده ۲۸",
      fullTitle: "تسهیلات از محل منابع ماده ۲۸ آیین‌نامه تولید، دانش‌بنیان و اشتغالزایی در صنعت نفت",
      href: "/dashboard/facilities-application",
      status: facilitiesSummary?.status ?? null,
      editable: facilitiesSummary?.status ? isFacilitiesApplicationEditable(facilitiesSummary.status) : true,
    },
  ];

  return (
    <AppShell
      area="user"
      eyebrow="داشبورد متقاضی"
      title="وضعیت پرونده"
      description="وضعیت دو مسیر زیر و پیام‌های مدیریت را از اینجا دنبال کنید."
      stickyHeader
    >
      <div className="applicant-dashboard">
        <DashboardEvaluationNotice />

        <section className="profile-callout" aria-label="پروفایل شرکت">
          <span className="profile-callout__icon" aria-hidden="true">
            <Building2 size={24} strokeWidth={2} />
          </span>
          <div className="profile-callout__text">
            <p className="profile-callout__eyebrow">پروفایل شرکت</p>
            <p className="profile-callout__title">{facilitiesSummary?.name}</p>
            <p className="profile-callout__meta" dir="ltr">
              {facilitiesSummary?.nationalId}
            </p>
          </div>
          <Link href="/dashboard/facilities-profile" className="button button--ghost profile-callout__action">
            ویرایش پروفایل
          </Link>
        </section>

        <div className="services-heading">
          <h2>خدمات قابل انتخاب</h2>
          <p>وضعیت و اقدام بعدی هر مسیر را ببینید.</p>
        </div>

        <div className="services-table-wrap">
          <table className="services-table">
            <thead>
              <tr>
                <th scope="col">خدمت</th>
                <th scope="col">وضعیت</th>
                <th scope="col">اقدام</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const label = !row.status
                  ? "شروع ثبت‌نام"
                  : row.status === "NEEDS_EDIT"
                    ? "اصلاح پرونده"
                    : row.editable
                      ? "ادامه ثبت‌نام"
                      : "مشاهده پرونده";

                return (
                  <tr key={row.key}>
                    <td>
                      <span className="services-table__row-title" title={row.fullTitle}>
                        <span className="services-table__index" aria-hidden="true">
                          {row.index}
                        </span>
                        {row.title}
                      </span>
                    </td>
                    <td>
                      {row.status ? (
                        <StatusBadge status={row.status} />
                      ) : (
                        <span className="status-badge" data-variant="muted">
                          شروع نشده
                        </span>
                      )}
                    </td>
                    <td>
                      <Link
                        href={row.href}
                        className={!row.status || row.editable ? "button button--primary button--sm" : "button button--ghost button--sm"}
                      >
                        {label}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {hasActiveEditRequest && application?.adminNote ? (
          <article className="review-message" data-state="active" aria-label="پیام مدیریت">
            <div className="review-message__header">
              <span className="review-message__icon" aria-hidden="true">
                <MessageSquareWarning size={21} strokeWidth={2.2} />
              </span>
              <div>
                <p className="review-message__eyebrow">اعتبارسنجی تأمین‌کنندگان</p>
                <h2>نیاز به اصلاح دارد</h2>
              </div>
              <span className="review-message__badge">اقدام لازم</span>
            </div>
            <div className="review-message__body">
              <p>{application.adminNote}</p>
            </div>
          </article>
        ) : null}

        <ValidationCertificateDownload certificate={validationCertificate} />
      </div>
    </AppShell>
  );
}
