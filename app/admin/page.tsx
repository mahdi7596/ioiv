import Link from "next/link";
import { redirect } from "next/navigation";
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
    ["کل پرونده‌ها", overview.total],
    ["ارسال شده", overview.submitted],
    ["در حال بررسی", overview.underReview],
    ["نیازمند ویرایش", overview.needsEdit],
    ["پذیرفته شده", overview.accepted],
    ["رد شده", overview.rejected],
  ];

  return (
    <AppShell
      area="admin"
      eyebrow="داشبورد مدیریت"
      title="نمای کلی پرونده‌ها"
      description="خلاصه وضعیت پرونده‌ها و دسترسی سریع به صف بررسی."
      action={
        <Link href="/admin/submissions" className="button button--primary">
          پرونده‌ها
        </Link>
      }
    >
      <section className="grid-cards">
        {cards.map(([label, value]) => (
          <div key={label} className="card metric">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>
    </AppShell>
  );
}
