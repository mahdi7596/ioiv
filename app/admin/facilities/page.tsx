import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getFacilitiesConfiguration } from "@/lib/actions/facilities-admin";
import { FacilitiesConfigurationForm } from "@/components/facilities/FacilitiesConfigurationForm";
export default async function FacilitiesAdminPage() { const data = await getFacilitiesConfiguration().catch(() => redirect("/admin")); return <AppShell area="admin" eyebrow="تنظیمات" title="پیکربندی تسهیلات" description="فقط مدیر ارشد می‌تواند دوره، تأمین‌کننده و نسخه پرسشنامه را فعال کند." action={<Link className="button button--ghost" href="/admin">بازگشت</Link>}><FacilitiesConfigurationForm data={JSON.parse(JSON.stringify(data))} /></AppShell>; }
