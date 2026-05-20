import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, LayoutDashboard } from "lucide-react";
import { SubmissionsFilters } from "@/components/admin/SubmissionsFilters";
import { SubmissionsTable } from "@/components/admin/SubmissionsTable";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentAdminPermissions, listSubmissions } from "@/lib/actions/admin";

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; sort?: string }>;
}) {
  const params = await searchParams;
  let submissions: Awaited<ReturnType<typeof listSubmissions>>;
  let permissions: Awaited<ReturnType<typeof getCurrentAdminPermissions>>;

  try {
    [submissions, permissions] = await Promise.all([
      listSubmissions(params),
      getCurrentAdminPermissions(),
    ]);
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
      description="فیلتر، خروجی و بررسی پرونده‌های ثبت شده."
      action={
        <Link href="/admin" className="button button--ghost" aria-label="نمای کلی" title="نمای کلی">
          <LayoutDashboard aria-hidden="true" size={19} strokeWidth={2} />
          نمای کلی
        </Link>
      }
    >
      <SubmissionsFilters
        q={params.q}
        status={params.status}
        sort={params.sort}
      />
      {permissions.exportSubmissions ? (
        <section className="panel export-actions" aria-label="خروجی پرونده‌ها">
          <Link
            className="button export-button"
            href={`/api/admin/export?${new URLSearchParams({ ...Object.fromEntries(exportQuery), format: "xlsx" }).toString()}`}
            aria-label="خروجی Excel"
            title="خروجی Excel"
          >
            <Download aria-hidden="true" size={18} strokeWidth={2} />
            خروجی Excel
          </Link>
          <Link
            className="button button--ghost"
            href={`/api/admin/export?${new URLSearchParams({ ...Object.fromEntries(exportQuery), format: "csv" }).toString()}`}
            aria-label="خروجی CSV"
            title="خروجی CSV"
          >
            خروجی CSV
          </Link>
        </section>
      ) : null}
      <SubmissionsTable submissions={submissions} />
    </AppShell>
  );
}
