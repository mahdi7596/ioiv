import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { canEditApplication } from "@/lib/application/status";
import { getCurrentUserApplication } from "@/lib/actions/application";

const statusLabels: Record<string, string> = {
  DRAFT: "پیش‌نویس",
  PENDING_PAYMENT: "در انتظار پرداخت",
  SUBMITTED: "ارسال شده",
  UNDER_REVIEW: "در حال بررسی",
  NEEDS_EDIT: "نیازمند ویرایش",
  REJECTED: "رد شده",
  ACCEPTED: "پذیرفته شده",
};

const statusGuidance: Record<string, string> = {
  DRAFT: "پرونده هنوز ارسال نشده است. می‌توانید مدارک را کامل کنید و پرداخت را انجام دهید.",
  PENDING_PAYMENT: "پرونده آماده پرداخت است. پس از پرداخت، پرونده برای بررسی ارسال می‌شود.",
  SUBMITTED: "پرونده ارسال شده و منتظر شروع بررسی است.",
  UNDER_REVIEW: "تیم مدیریت در حال بررسی مدارک شماست.",
  NEEDS_EDIT: "پرونده نیازمند اصلاح است. یادداشت مدیریت را بررسی کنید و مدارک را اصلاح کنید.",
  REJECTED: "پرونده رد شده است. برای پیگیری، یادداشت مدیریت یا پشتیبانی را بررسی کنید.",
  ACCEPTED: "پرونده پذیرفته شده و نیازی به اقدام بیشتر نیست.",
};

export default async function DashboardPage() {
  let data: Awaited<ReturnType<typeof getCurrentUserApplication>>;

  try {
    data = await getCurrentUserApplication();
  } catch {
    redirect("/");
  }

  const { application } = data;
  const latestPayment = application?.payments[0];
  const editable = application ? canEditApplication(application.status) : true;

  return (
    <AppShell
      area="user"
      eyebrow="داشبورد متقاضی"
      title="وضعیت پرونده"
      description="وضعیت فعلی، اقدام بعدی و پیام‌های مدیریت را از اینجا دنبال کنید."
      action={
        <Link href="/dashboard/application" className="button button--primary" aria-disabled={application ? !editable : false}>
          {application ? "مشاهده پرونده" : "شروع ثبت مدارک"}
        </Link>
      }
    >
      <section className="panel status-card">
        {application ? (
          <div className="space-y-5">
            <div className="detail-grid">
              <div>
                <p className="stat-label">وضعیت</p>
                <p className="stat-value">{statusLabels[application.status]}</p>
              </div>
              <div>
                <p className="stat-label">شناسه ملی شرکت</p>
                <p className="stat-value" dir="ltr">
                  {application.companyNationalId}
                </p>
              </div>
              <div>
                <p className="stat-label">پرداخت</p>
                <p className="stat-value">
                  {latestPayment ? statusLabels[latestPayment.status] || latestPayment.status : "ثبت نشده"}
                </p>
              </div>
              <div>
                <p className="stat-label">مرحله فعلی</p>
                <p className="stat-value">{application.currentStep}</p>
              </div>
            </div>

            <p className="notice">{statusGuidance[application.status]}</p>

            {application.adminNote ? (
              <div className="notice">
                {application.adminNote}
              </div>
            ) : null}

            <Link
              href="/dashboard/application"
              aria-disabled={!editable}
              className={editable ? "button button--primary" : "button button--ghost"}
            >
              {editable ? "ادامه یا ویرایش پرونده" : "پرونده قابل ویرایش نیست"}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p>برای شروع، پرونده ثبت مدارک شرکت را ایجاد کنید. پس از ذخیره، می‌توانید مرحله‌ها را ادامه دهید.</p>
            <Link href="/dashboard/application" className="button button--primary">
              شروع ثبت مدارک
            </Link>
          </div>
        )}
      </section>
    </AppShell>
  );
}
