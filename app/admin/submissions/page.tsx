import Link from "next/link";
import { redirect } from "next/navigation";
import { SubmissionsTable } from "@/components/admin/SubmissionsTable";
import { AppShell } from "@/components/layout/AppShell";
import { listSubmissions } from "@/lib/actions/admin";

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; sort?: string }>;
}) {
  const params = await searchParams;
  let submissions: Awaited<ReturnType<typeof listSubmissions>>;

  try {
    submissions = await listSubmissions(params);
  } catch {
    redirect("/admin/login");
  }

  const exportQuery = new URLSearchParams({
    ...(params.q ? { q: params.q } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.sort ? { sort: params.sort } : {}),
  });

  return (
    <AppShell
      area="admin"
      eyebrow="مدیریت"
      title="پرونده‌ها"
      description="فیلتر، خروجی و بررسی پرونده‌های ارسال شده."
      action={
        <Link href="/admin" className="button button--ghost">
          نمای کلی
        </Link>
      }
    >
      <form className="panel grid gap-3 sm:grid-cols-4">
        <input name="q" defaultValue={params.q} placeholder="جستجو" className="rounded-md border border-stone-300 px-3 py-2" />
        <select name="status" defaultValue={params.status} className="rounded-md border border-stone-300 px-3 py-2">
          <option value="">همه وضعیت‌ها</option>
          <option value="SUBMITTED">ارسال شده</option>
          <option value="UNDER_REVIEW">در حال بررسی</option>
          <option value="NEEDS_EDIT">نیازمند ویرایش</option>
          <option value="ACCEPTED">پذیرفته شده</option>
          <option value="REJECTED">رد شده</option>
        </select>
        <select name="sort" defaultValue={params.sort} className="rounded-md border border-stone-300 px-3 py-2">
          <option value="newest">جدیدترین</option>
          <option value="oldest">قدیمی‌ترین</option>
        </select>
        <button className="button button--primary">اعمال</button>
      </form>
      <div className="flex justify-end">
        <Link className="ml-4 text-sm font-medium text-emerald-800" href={`/api/admin/export?${exportQuery.toString()}`}>
          خروجی XLSX
        </Link>
        <Link
          className="text-sm font-medium text-emerald-800"
          href={`/api/admin/export?${new URLSearchParams({ ...Object.fromEntries(exportQuery), format: "csv" }).toString()}`}
        >
          خروجی CSV
        </Link>
      </div>
      <SubmissionsTable submissions={submissions} />
    </AppShell>
  );
}
