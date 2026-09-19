export function facilitiesDocumentLabel(slot: string) {
  const labels: Record<string, string> = { questionnaire: "پرسشنامه", licences: "مجوزها", "active-contracts": "قراردادهای فعال", insurance: "لیست بیمه", "trial-general": "تراز کل", "trial-subsidiary": "تراز معین", "credit-company": "گزارش اعتباری شرکت", "credit-ceo": "گزارش اعتباری مدیرعامل", "credit-board": "گزارش اعتباری عضو هیئت‌مدیره", "profile-incorporation-notice": "آگهی تأسیس", "profile-articles-of-association": "اساسنامه", "profile-board-changes-gazette": "روزنامه تغییرات هیئت‌مدیره", "profile-capital-increase-gazette": "روزنامه افزایش سرمایه" };
  if (labels[slot]) return labels[slot];
  if (slot.startsWith("officer-")) return "مدارک هویتی عضو شرکت";
  for (const [prefix,label] of [["tax-","اظهارنامه مالیاتی"],["financial-","صورت مالی"],["vat-","ارزش افزوده"]]) if (slot.startsWith(prefix)) return `${label} ${slot.slice(prefix.length)}`;
  return "مدارک درخواست";
}
