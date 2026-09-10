import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getFacilitiesWizard } from "@/lib/actions/facilities-application";
import { FacilitiesApplicationWizard } from "@/components/facilities/FacilitiesApplicationWizard";
export default async function FacilitiesApplicationPage({ searchParams }: { searchParams: Promise<{ payment?: string; submitted?: string }> }) {
  const data = await getFacilitiesWizard().catch(() => redirect("/dashboard/facilities-profile"));
  const params = await searchParams;
  return <AppShell area="user" eyebrow="تسهیلات" title="درخواست تسهیلات" description="پیش‌نویس را کامل و بررسی کنید؛ پرداخت و ارسال پس از بررسی نهایی انجام می‌شود." action={<Link href="/dashboard" className="button button--ghost">بازگشت</Link>}><FacilitiesApplicationWizard data={JSON.parse(JSON.stringify(data))} notice={params.payment || params.submitted} /></AppShell>;
}
