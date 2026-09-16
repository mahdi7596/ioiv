import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { redirect } from "next/navigation";
import { ApplicationWizard } from "@/components/application/ApplicationWizard";
import { DashboardEvaluationNotice } from "@/components/dashboard/DashboardEvaluationNotice";
import { AppShell } from "@/components/layout/AppShell";
import type { ApplicationDraft } from "@/components/application/types";
import { getApplicationAccess } from "@/lib/application/status";
import { ActionError } from "@/lib/actions/auth";
import { createOrGetDraftApplication } from "@/lib/actions/application";

function arrayOrEmpty(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function objectOrEmpty(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export default async function ApplicationPage() {
  let application: Awaited<ReturnType<typeof createOrGetDraftApplication>>;

  try {
    application = await createOrGetDraftApplication();
  } catch (error) {
    if (error instanceof ActionError && error.status === 400) {
      redirect("/dashboard/facilities-profile");
    }
    redirect("/");
  }

  const access = getApplicationAccess(application.status);
  const hasVerifiedPayment = application.payments.some((payment) => payment.status === "VERIFIED");
  const latestPaymentStatus = application.payments[0]?.status;

  if (!access.canView) {
    redirect("/dashboard");
  }

  return (
    <AppShell
      area="user"
      eyebrow={access.canEdit ? "ثبت مدارک" : "مشاهده مدارک"}
      title="فرم پرونده شرکت"
      description={
        access.canEdit
          ? "مدارک را مرحله به مرحله بارگذاری کنید. پیش‌نویس شما در طول مسیر ذخیره می‌شود."
          : "پرونده ثبت شده قابل مشاهده است. ویرایش فقط زمانی فعال می‌شود که مدیر پرونده درخواست اصلاح ثبت کند."
      }
      action={
        <Link href="/dashboard" className="button button--ghost button--back" aria-label="بازگشت به داشبورد" title="بازگشت به داشبورد">
          <ArrowRight aria-hidden="true" size={19} strokeWidth={2} />
          بازگشت
        </Link>
      }
    >
      <DashboardEvaluationNotice />
      <ApplicationWizard
        applicationId={application.id}
        initialStep={application.currentStep}
        readOnly={!access.canEdit}
        canRetryPayment={access.canRetryPayment && !hasVerifiedPayment}
        hasVerifiedPayment={hasVerifiedPayment}
        latestPaymentStatus={latestPaymentStatus}
        initialDraft={
          {
            currentStep: application.currentStep,
            taxDeclarations: arrayOrEmpty(application.taxDeclarations),
            financials: arrayOrEmpty(application.financials),
            humanResources: objectOrEmpty(application.humanResources),
            trialBalance: objectOrEmpty(application.trialBalance),
            creditReports: objectOrEmpty(application.creditReports),
          } as ApplicationDraft
        }
      />
    </AppShell>
  );
}
