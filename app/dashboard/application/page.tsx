import Link from "next/link";
import { redirect } from "next/navigation";
import { ApplicationWizard } from "@/components/application/ApplicationWizard";
import { AppShell } from "@/components/layout/AppShell";
import type { ApplicationDraft } from "@/components/application/types";
import { canEditApplication } from "@/lib/application/status";
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
  } catch {
    redirect("/");
  }

  if (!canEditApplication(application.status)) {
    redirect("/dashboard");
  }

  return (
    <AppShell
      area="user"
      eyebrow="ثبت مدارک"
      title="فرم پرونده شرکت"
      description="مدارک را مرحله به مرحله بارگذاری کنید. پیش‌نویس شما در طول مسیر ذخیره می‌شود."
      action={
        <Link href="/dashboard" className="button button--ghost">
          بازگشت به داشبورد
        </Link>
      }
    >
      <ApplicationWizard
        applicationId={application.id}
        initialStep={application.currentStep}
        initialDraft={
          {
            currentStep: application.currentStep,
            taxDeclarations: arrayOrEmpty(application.taxDeclarations),
            financials: arrayOrEmpty(application.financials),
            trialBalance: objectOrEmpty(application.trialBalance),
            creditReports: objectOrEmpty(application.creditReports),
          } as ApplicationDraft
        }
      />
    </AppShell>
  );
}
