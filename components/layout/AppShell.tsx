import Image from "next/image";
import Link from "next/link";
import { ClipboardList, Files, LayoutDashboard, LogOut } from "lucide-react";
import type { ReactNode } from "react";

type AppShellProps = {
  area: "user" | "admin";
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
};

const userNav = [
  { href: "/dashboard", label: "داشبورد", icon: LayoutDashboard },
  { href: "/dashboard/application", label: "ثبت مدارک", icon: ClipboardList },
];

const adminNav = [
  { href: "/admin", label: "نمای کلی", icon: LayoutDashboard },
  { href: "/admin/submissions", label: "پرونده‌ها", icon: Files },
];

export function AppShell({ area, eyebrow, title, description, action, children }: AppShellProps) {
  const nav = area === "admin" ? adminNav : userNav;

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="ناوبری">
        <Link href={area === "admin" ? "/admin" : "/dashboard"} className="app-brand">
          <span className="app-brand__mark">
            <Image
              src="/ioiv-logo.png"
              alt="نشان صندوق پژوهش و فناوری صنعت نفت"
              width={56}
              height={56}
              className="app-brand__logo"
            />
          </span>
          <span>
            <strong>سانا</strong>
            <small>{area === "admin" ? "پنل مدیریت" : "پنل متقاضی"}</small>
          </span>
        </Link>
        <nav className="app-nav">
          {nav.map((item) => {
            const Icon = item.icon;

            return (
              <Link key={item.href} href={item.href} className="app-nav__link" aria-label={item.label} title={item.label}>
                <Icon aria-hidden="true" size={18} strokeWidth={2} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <form action="/api/auth/logout" method="post" className="app-logout">
          <button type="submit" aria-label="خروج" title="خروج">
            <LogOut aria-hidden="true" size={18} strokeWidth={2} />
            <span>خروج</span>
          </button>
        </form>
      </aside>

      <div className="app-shell__main">
        <header className="app-header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            {description ? <p className="app-header__description">{description}</p> : null}
          </div>
          {action ? <div className="app-header__action">{action}</div> : null}
        </header>

        <nav className="mobile-nav" aria-label="ناوبری موبایل">
          {nav.map((item) => {
            const Icon = item.icon;

            return (
              <Link key={item.href} href={item.href} aria-label={item.label} title={item.label}>
                <Icon aria-hidden="true" size={18} strokeWidth={2} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <form action="/api/auth/logout" method="post">
            <button type="submit" aria-label="خروج" title="خروج">
              <LogOut aria-hidden="true" size={18} strokeWidth={2} />
              <span>خروج</span>
            </button>
          </form>
        </nav>

        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
