import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Files, Settings, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { getAdminOverview } from "@/lib/actions/admin";
import { canManageFacilitiesConfiguration } from "@/lib/actions/facilities-config";
import { getFacilitiesReviewOverview } from "@/lib/actions/facilities-review";
import { getCurrentAdminPermissions } from "@/lib/actions/admin";

export default async function AdminPage() {
  let overview: Awaited<ReturnType<typeof getAdminOverview>>;
  let canManageFacilities = false;
  let facilitiesOverview: Awaited<ReturnType<typeof getFacilitiesReviewOverview>>;
  let permissions: Awaited<ReturnType<typeof getCurrentAdminPermissions>>;

  try {
    [overview, canManageFacilities, facilitiesOverview, permissions] = await Promise.all([getAdminOverview(), canManageFacilitiesConfiguration(), getFacilitiesReviewOverview(), getCurrentAdminPermissions()]);
  } catch {
    redirect("/admin/login");
  }

  const cards = [
    { label: "کل پرونده‌ها", value: overview.total, href: "/admin/submissions" },
    { label: "در صف بررسی", value: overview.submitted, href: "/admin/submissions?status=SUBMITTED" },
    { label: "در حال بررسی", value: overview.underReview, href: "/admin/submissions?status=UNDER_REVIEW" },
    { label: "نیازمند اصلاح", value: overview.needsEdit, href: "/admin/submissions?status=NEEDS_EDIT" },
    {
      label: "پایان فرآیند اعتبارسنجی",
      value: overview.validationCompleted,
      href: "/admin/submissions?status=VALIDATION_COMPLETED",
    },
  ];

  return (
    <AppShell
      area="admin"
      eyebrow="داشبورد مدیریت"
      title="نمای کلی پرونده‌ها"
      description="خلاصه وضعیت پرونده‌ها و دسترسی سریع به صف بررسی."
      action={
        <div className="flex gap-2 flex-wrap">{canManageFacilities ? <Link href="/admin/facilities" className="button button--ghost"><Settings aria-hidden="true" size={19} />پیکربندی تسهیلات</Link> : null}{permissions.viewFacilitiesAudit ? <Link href="/admin/facilities/audit" className="button button--ghost"><ShieldCheck aria-hidden="true" size={19} />ممیزی تسهیلات</Link> : null}<Link href="/admin/facilities/applications" className="button button--ghost"><Building2 aria-hidden="true" size={19} />بررسی تسهیلات</Link><Link href="/admin/submissions" className="button button--primary" aria-label="پرونده‌ها" title="پرونده‌ها"><Files aria-hidden="true" size={19} strokeWidth={2} />پرونده‌ها</Link></div>
      }
    >
      <section className="grid-cards">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="card metric metric--link">
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </Link>
        ))}
      </section>
      <section className="panel"><div className="flex items-center justify-between gap-3 flex-wrap"><div><p className="eyebrow">تسهیلات</p><h2>صف بررسی مستقل</h2><p>{facilitiesOverview.total} پرونده؛ {facilitiesOverview.submitted} در صف، {facilitiesOverview.underReview} در حال بررسی و {facilitiesOverview.needsEdit} نیازمند اصلاح.</p></div><Link href="/admin/facilities/applications" className="button button--primary"><Building2 aria-hidden="true" size={19} />مشاهده پرونده‌های تسهیلات</Link></div></section>
    </AppShell>
  );
}
