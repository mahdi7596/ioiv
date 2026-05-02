import type { Metadata } from "next";
import localFont from "next/font/local";
import { ToastProvider } from "@/components/ui/ToastProvider";
import "./globals.css";

const iranyekan = localFont({
  variable: "--font-iranyekan",
  display: "swap",
  src: [
    {
      path: "../public/fonts/iranyekan/IRANYekanXFaNum-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/iranyekan/IRANYekanXFaNum-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
});

export const metadata: Metadata = {
  title: "سامانه اعتبارسنجی صندوق پژوهش و فناوری صنعت نفت (سانا)",
  description: "سامانه ثبت نام، پرداخت و بررسی مدارک سانا",
  icons: {
    icon: "/ioiv-logo.jpeg",
    shortcut: "/ioiv-logo.jpeg",
    apple: "/ioiv-logo.jpeg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" className={`${iranyekan.variable} h-full antialiased`}>
      <body>
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}
