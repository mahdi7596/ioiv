import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { CompanyProfileForm } from "@/components/facilities/CompanyProfileForm";
import { getFacilitiesCompanyProfile } from "@/lib/actions/facilities-company";
export default async function FacilitiesProfilePage() {
  let profile;
  try { profile = await getFacilitiesCompanyProfile(); } catch { redirect("/"); }
  const initial = profile ? { version: profile.profileVersion, name: profile.name ?? "", nationalId: profile.nationalId ?? "", registrationNumber: profile.registrationNumber ?? "", registrationPlace: profile.registrationPlace ?? "", registrationDate: profile.registrationDate?.toISOString().slice(0, 10) ?? "", registeredCapitalRial: profile.registeredCapitalRial?.toString() ?? "", contactFullName: profile.contactFullName ?? "", contactNationalCode: profile.contactNationalCode ?? "", shareholders: profile.shareholders.map((item) => ({ id: item.id, fullName: item.fullName, ownershipPercentage: item.ownershipPercentage.toString() })), officers: profile.officers.map((item) => ({ id: item.id, fullName: item.fullName, position: item.position })) } : null;
  // Seed the form with documents already uploaded AND passed, so they show as
  // done on reload. Keys mirror the form's internal slots: company docs drop the
  // "profile-" prefix; officer identity packages drop the "-identity-package" suffix.
  const documents = profile ? Object.fromEntries(profile.facilitiesFileBindings
    .filter((binding) => binding.currentUpload?.lifecycleStatus === "PASSED" && binding.currentUpload.storedFile?.scanStatus === "PASSED")
    .map((binding) => [binding.slotKey.startsWith("profile-") ? binding.slotKey.slice("profile-".length) : binding.slotKey.replace(/-identity-package$/, ""), { fileName: binding.currentUpload!.storedFile!.originalName }])) : undefined;
  return (
    <AppShell
      area="user"
      eyebrow="پروفایل شرکت"
      title="اطلاعات پایه شرکت"
      description="این اطلاعات یک‌بار تکمیل می‌شود و برای هر دو سرویس (اعتبارسنجی وزارت نفت و تسهیلات) به‌کار می‌رود."
      action={
        <Link href="/dashboard" className="button button--ghost button--back" aria-label="بازگشت به داشبورد" title="بازگشت به داشبورد">
          <ArrowRight aria-hidden="true" size={19} strokeWidth={2} />
          بازگشت
        </Link>
      }
    >
      <CompanyProfileForm initial={initial} documents={documents} locked={profile?.profileLocked} />
    </AppShell>
  );
}
