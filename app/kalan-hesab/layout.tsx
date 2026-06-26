import type { Metadata } from "next";
import "./kalan-hesab.css";

export const metadata: Metadata = {
  title: "کلان حساب",
  description: "فرم ارزیابی تخصصی کلان حساب",
  icons: {
    icon: "/kalanhesab/kalan-hesab-only-logo.png",
    shortcut: "/kalanhesab/kalan-hesab-only-logo.png",
    apple: "/kalanhesab/kalan-hesab-only-logo.png",
  },
};

export default function KalanHesabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="kalan-hesab-theme">{children}</div>;
}
