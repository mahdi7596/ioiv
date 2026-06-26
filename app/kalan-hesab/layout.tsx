import type { Metadata } from "next";
import "./kalan-hesab.css";

export const metadata: Metadata = {
  title: "کالان حساب",
  description: "فرم ارزیابی تخصصی کالان حساب",
  icons: {
    icon: "/kalan-hesab-logo.jpeg",
    shortcut: "/kalan-hesab-logo.jpeg",
    apple: "/kalan-hesab-logo.jpeg",
  },
};

export default function KalanHesabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="kalan-hesab-theme">{children}</div>;
}
