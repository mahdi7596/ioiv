import Link from "next/link";
import { redirect } from "next/navigation";
import { Files } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { getAdminOverview } from "@/lib/actions/admin";

export default async function AdminPage() {
  let overview: Awaited<ReturnType<typeof getAdminOverview>>;

  try {
    overview = await getAdminOverview();
  } catch {
    redirect("/admin/login");
  }

  const cards = [
    { label: "کل پرونده‌ها", value: overview.total, href: "/admin/submissions" },
    { label: "در صف بررسی", value: overview.submitted, href: "/admin/submissions?status=SUBMITTED" },
    { label: "در حال بررسی", value: overview.underReview, href: "/admin/submissions?status=UNDER_REVIEW" },
    { label: "نیازمند اصلاح", value: overview.needsEdit, href: "/admin/submissions?status=NEEDS_EDIT" },
    { label: "تایید شده", value: overview.accepted, href: "/admin/submissions?status=ACCEPTED" },
    { label: "رد شده", value: overview.rejected, href: "/admin/submissions?status=REJECTED" },
  ];

  return (
    <AppShell
      area="admin"
      eyebrow="داشبورد مدیریت"
      title="نمای کلی پرونده‌ها"
      description="خلاصه وضعیت پرونده‌ها و دسترسی سریع به صف بررسی."
      action={
        <Link href="/admin/submissions" className="button button--primary" aria-label="پرونده‌ها" title="پرونده‌ها">
          <Files aria-hidden="true" size={19} strokeWidth={2} />
          پرونده‌ها
        </Link>
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
