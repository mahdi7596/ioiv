import Link from "next/link";
import { redirect } from "next/navigation";
import { Files, Settings } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { getAdminOverview } from "@/lib/actions/admin";
import { canManageFacilitiesConfiguration } from "@/lib/actions/facilities-config";

export default async function AdminPage() {
  let overview: Awaited<ReturnType<typeof getAdminOverview>>;
  let canManageFacilities = false;

  try {
    [overview, canManageFacilities] = await Promise.all([getAdminOverview(), canManageFacilitiesConfiguration()]);
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
        <div className="flex gap-2">{canManageFacilities ? <Link href="/admin/facilities" className="button button--ghost"><Settings aria-hidden="true" size={19} />پیکربندی تسهیلات</Link> : null}<Link href="/admin/submissions" className="button button--primary" aria-label="پرونده‌ها" title="پرونده‌ها"><Files aria-hidden="true" size={19} strokeWidth={2} />پرونده‌ها</Link></div>
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
    </AppShell>
  );
}
