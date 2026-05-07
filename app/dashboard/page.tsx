import Link from "next/link";
import { ClipboardList, Info, MessageSquareWarning } from "lucide-react";
import { redirect } from "next/navigation";
import { PaymentStatusBadge } from "@/components/admin/PaymentStatusBadge";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DashboardEvaluationNotice } from "@/components/dashboard/DashboardEvaluationNotice";
import { ValidationCertificateDownload } from "@/components/dashboard/ValidationCertificateDownload";
import { AppShell } from "@/components/layout/AppShell";
import { canEditApplication } from "@/lib/application/status";
import { getCurrentUserApplication } from "@/lib/actions/application";

const statusGuidance: Record<string, string> = {
  DRAFT: "پرونده هنوز ارسال نشده است. می‌توانید مدارک را کامل کنید و پرداخت را انجام دهید.",
  PENDING_PAYMENT: "پرونده کامل شده و منتظر نتیجه پرداخت از درگاه است.",
  SUBMITTED: "پرداخت موفق بوده و پرونده در صف بررسی مدیریت قرار دارد.",
  UNDER_REVIEW: "تیم مدیریت در حال بررسی مدارک شماست.",
  NEEDS_EDIT: "پرونده نیازمند اصلاح است. یادداشت مدیریت را بررسی کنید و موارد خواسته شده را اصلاح کنید.",
  VALIDATION_COMPLETED: "فرآیند اعتبارسنجی پرونده به پایان رسیده است.",
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
  const validationCertificate = application?.files[0];
  const editable = application ? canEditApplication(application.status) : true;
  const hasActiveEditRequest = application?.status === "NEEDS_EDIT";

  return (
    <AppShell
      area="user"
      eyebrow="داشبورد متقاضی"
      title="وضعیت پرونده"
      description="وضعیت فعلی، اقدام بعدی و پیام‌های مدیریت را از اینجا دنبال کنید."
      action={
        <Link
          href="/dashboard/application"
          className="button button--primary"
          aria-disabled={false}
          aria-label={application ? "مشاهده پرونده" : "شروع ثبت مدارک"}
          title={application ? "مشاهده پرونده" : "شروع ثبت مدارک"}
        >
          <ClipboardList aria-hidden="true" size={19} strokeWidth={2} />
          {application ? "مشاهده پرونده" : "شروع ثبت مدارک"}
        </Link>
      }
    >
      <DashboardEvaluationNotice />

      <section className="panel status-card">
        {application ? (
          <div className="space-y-5">
            <div className="detail-grid">
              <div>
                <p className="stat-label">وضعیت</p>
                <div className="mt-2">
                  <StatusBadge status={application.status} />
                </div>
              </div>
              <div>
                <p className="stat-label">شناسه ملی شرکت</p>
                <p className="stat-value" dir="ltr">
                  {application.companyNationalId}
                </p>
              </div>
              <div>
                <p className="stat-label">پرداخت</p>
                <div className="mt-2">
                  <PaymentStatusBadge status={latestPayment?.status} />
                </div>
              </div>
              <div>
                <p className="stat-label">مرحله فعلی</p>
                <p className="stat-value">{application.currentStep}</p>
              </div>
            </div>

            <p className="status-info" role="status">
              <Info aria-hidden="true" size={20} strokeWidth={2.2} />
              <span>{statusGuidance[application.status]}</span>
            </p>

            {application.adminNote ? (
              <article
                className="review-message"
                data-state={hasActiveEditRequest ? "active" : "resolved"}
                aria-label="پیام مدیریت"
              >
                <div className="review-message__header">
                  <span className="review-message__icon" aria-hidden="true">
                    <MessageSquareWarning size={21} strokeWidth={2.2} />
                  </span>
                  <div>
                    <p className="review-message__eyebrow">
                      {hasActiveEditRequest ? "پیام کارشناس بررسی" : "پیام قبلی کارشناس"}
                    </p>
                    <h2>
                      {hasActiveEditRequest
                        ? "مواردی که باید اصلاح شود"
                        : "درخواست اصلاح قبلی شما ثبت و ارسال شده است"}
                    </h2>
                  </div>
                  <span className="review-message__badge">
                    {hasActiveEditRequest ? "اقدام لازم" : "ارسال شد"}
                  </span>
                </div>
                {!hasActiveEditRequest ? (
                  <p className="review-message__context">
                    این پیام مربوط به مرحله اصلاح قبلی است. اگر کارشناس دوباره موردی ثبت کند،
                    پیام جدید همین‌جا جایگزین می‌شود.
                  </p>
                ) : null}
                <div className="review-message__body">
                  <p>{application.adminNote}</p>
                </div>
              </article>
            ) : null}

            <ValidationCertificateDownload certificate={validationCertificate} />

            <Link
              href="/dashboard/application"
              className={editable ? "button button--primary" : "button button--ghost"}
            >
              <ClipboardList aria-hidden="true" size={18} strokeWidth={2} />
              {editable ? "ادامه یا ویرایش پرونده" : "مشاهده پرونده ثبت شده"}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p>برای شروع، پرونده ثبت مدارک شرکت را ایجاد کنید. پس از ذخیره، می‌توانید مرحله‌ها را ادامه دهید.</p>
            <Link href="/dashboard/application" className="button button--primary">
              <ClipboardList aria-hidden="true" size={18} strokeWidth={2} />
              شروع ثبت مدارک
            </Link>
          </div>
        )}
      </section>
    </AppShell>
  );
}
