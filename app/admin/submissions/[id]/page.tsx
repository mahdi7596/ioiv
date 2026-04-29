import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { StatusChangeForm } from "@/components/admin/StatusChangeForm";
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
        <Link href="/admin/submissions" className="button button--ghost">
          بازگشت
        </Link>
      }
    >

      <section className="panel detail-grid">
        <div>
          <p className="text-sm text-stone-500">موبایل</p>
          <p dir="ltr" className="mt-1 font-semibold">{submission.mobile}</p>
        </div>
        <div>
          <p className="text-sm text-stone-500">وضعیت</p>
          <div className="mt-1"><StatusBadge status={submission.status} /></div>
        </div>
        <div>
          <p className="text-sm text-stone-500">پرداخت</p>
          <p className="mt-1 font-semibold">{submission.payments[0]?.status || "ثبت نشده"}</p>
        </div>
      </section>

      <section className="panel">
        <h2 className="text-xl font-bold text-stone-950">فایل‌ها</h2>
        <div className="mt-4 grid gap-3">
          {submission.files.map((file) => (
            <a key={file.id} className="text-sm font-medium text-emerald-800" href={`/api/files/${file.id}`}>
              {file.fieldKey} - {file.originalName}
            </a>
          ))}
          {submission.files.length === 0 ? <p className="text-sm text-stone-500">فایلی ثبت نشده است.</p> : null}
        </div>
      </section>

      <section className="panel">
        <h2 className="text-xl font-bold text-stone-950">سوابق وضعیت</h2>
        <div className="mt-4 space-y-3">
          {submission.history.map((item) => (
            <div key={item.id} className="rounded-md bg-stone-50 p-3 text-sm text-stone-700">
              {item.previousStatus || "-"} به {item.newStatus} - {item.createdAt.toLocaleDateString("fa-IR")}
              {item.note ? <p className="mt-2">{item.note}</p> : null}
            </div>
          ))}
        </div>
      </section>

      <StatusChangeForm applicationId={submission.id} />
    </AppShell>
  );
}
