import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { FacilitiesConfiguration } from "@/components/admin/FacilitiesConfiguration";
import { getFacilitiesConfiguration } from "@/lib/actions/facilities-config";

export default async function FacilitiesConfigurationPage() {
  const data = await getFacilitiesConfiguration();
  return <AppShell area="admin" eyebrow="تسهیلات" title="پیکربندی برنامه تسهیلات" description="فقط مدیر ارشد فعال به این تنظیمات خصوصی دسترسی دارد." action={<Link className="button button--ghost" href="/admin">بازگشت</Link>}><FacilitiesConfiguration initial={{ programmeEnabled: data.programme?.isEnabled ?? false, suppliers: data.suppliers.map((supplier) => ({ ...supplier, templates: supplier.templates.map((template) => ({ ...template, publishedAt: template.publishedAt?.toISOString() ?? null })) })), intakes: data.intakes.map((intake) => ({ ...intake, maximumAmountRial: intake.maximumAmountRial.toString() })) }} /></AppShell>;
}
