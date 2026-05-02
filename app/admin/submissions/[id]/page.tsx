import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { PaymentStatusBadge } from "@/components/admin/PaymentStatusBadge";
import { SubmissionFiles } from "@/components/admin/SubmissionFiles";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { StatusChangeForm } from "@/components/admin/StatusChangeForm";
import { StatusHistoryTimeline } from "@/components/admin/StatusHistoryTimeline";
import { AppShell } from "@/components/layout/AppShell";
import { getSubmission } from "@/lib/actions/admin";

export default async function SubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let submission: Awaited<ReturnType<typeof getSubmission>>;

  try {
    submission = await getSubmission(id);
  } catch {
    redirect("/admin/login");
  }

  if (!submission) notFound();

  return (
    <AppShell
      area="admin"
      eyebrow="جزئیات پرونده"
      title={submission.companyNationalId}
      description="مدارک، پرداخت، سوابق و تغییر وضعیت پرونده."
      action={
        <Link href="/admin/submissions" className="button button--ghost" aria-label="بازگشت" title="بازگشت">
          <ArrowRight aria-hidden="true" size={19} strokeWidth={2} />
          بازگشت
        </Link>
      }
    >
      <div className="admin-submission-detail">

      <section className="panel detail-grid">
        <div>
          <p className="text-sm text-stone-500">نام شرکت</p>
          <p className="mt-1 font-semibold">{submission.companyName || "-"}</p>
        </div>
        <div>
          <p className="text-sm text-stone-500">شناسه ملی شرکت</p>
          <p dir="ltr" className="mt-1 font-semibold">{submission.companyNationalId}</p>
        </div>
        <div>
          <p className="text-sm text-stone-500">موبایل</p>
          <p dir="ltr" className="mt-1 font-semibold">{submission.mobile}</p>
        </div>
        <div>
          <p className="text-sm text-stone-500">نام و نام خانوادگی رابط شرکت</p>
          <p className="mt-1 font-semibold">{submission.companyContactFullName || "-"}</p>
        </div>
        <div>
          <p className="text-sm text-stone-500">کد ملی رابط شرکت</p>
          <p dir="ltr" className="mt-1 font-semibold">{submission.companyContactNationalCode || "-"}</p>
        </div>
        <div>
          <p className="text-sm text-stone-500">وضعیت</p>
          <div className="mt-1"><StatusBadge status={submission.status} /></div>
        </div>
        <div>
          <p className="text-sm text-stone-500">پرداخت</p>
          <div className="mt-1"><PaymentStatusBadge status={submission.payments[0]?.status} /></div>
        </div>
        <div>
          <p className="text-sm text-stone-500">دوره درخواست</p>
          <p className="mt-1 font-semibold">{submission.applicationRound}</p>
        </div>
      </section>

      <section className="panel">
        <h2 className="text-xl font-bold text-stone-950">فایل های آپلود شده</h2>
        <SubmissionFiles
          files={submission.files}
          taxDeclarations={submission.taxDeclarations}
          financials={submission.financials}
        />
      </section>

      <section className="panel">
        <h2 className="text-xl font-bold text-stone-950">سوابق وضعیت</h2>
        <StatusHistoryTimeline items={submission.history} />
      </section>

      <StatusChangeForm
        applicationId={submission.id}
        currentStatus={submission.status}
        companyNationalId={submission.companyNationalId}
      />
      </div>
    </AppShell>
  );
}
