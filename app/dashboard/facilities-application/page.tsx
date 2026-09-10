import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getFacilitiesWizard } from "@/lib/actions/facilities-application";
import { FacilitiesApplicationWizard } from "@/components/facilities/FacilitiesApplicationWizard";
export default async function FacilitiesApplicationPage() { const data = await getFacilitiesWizard().catch(() => redirect("/dashboard/facilities-profile")); return <AppShell area="user" eyebrow="تسهیلات" title="درخواست تسهیلات" description="پیش‌نویس را کامل و بررسی کنید؛ ارسال و پرداخت در این مرحله انجام نمی‌شود." action={<Link href="/dashboard" className="button button--ghost">بازگشت</Link>}><FacilitiesApplicationWizard data={JSON.parse(JSON.stringify(data))} /></AppShell>; }
