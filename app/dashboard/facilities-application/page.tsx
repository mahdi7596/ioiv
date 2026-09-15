import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { getFacilitiesWizard } from "@/lib/actions/facilities-application";
import { FacilitiesApplicationWizard } from "@/components/facilities/FacilitiesApplicationWizard";
import { deriveFacilitiesPaymentNotice } from "@/lib/facilities/payment-notice";
export default async function FacilitiesApplicationPage({ searchParams }: { searchParams: Promise<{ payment?: string; submitted?: string }> }) {
  const data = await getFacilitiesWizard().catch(() => redirect("/dashboard/facilities-profile"));
  const params = await searchParams;
  return <AppShell area="user" eyebrow="تسهیلات" title="درخواست تسهیلات" description="پیش‌نویس را کامل و بررسی کنید؛ پرداخت و ارسال پس از بررسی نهایی انجام می‌شود." action={<Link href="/dashboard" className="button button--ghost button--back" aria-label="بازگشت به داشبورد" title="بازگشت به داشبورد"><ArrowRight aria-hidden="true" size={19} strokeWidth={2} />بازگشت</Link>}><FacilitiesApplicationWizard data={JSON.parse(JSON.stringify(data))} notice={deriveFacilitiesPaymentNotice(params.payment, data.applications[0]) ?? params.submitted} /></AppShell>;
}
