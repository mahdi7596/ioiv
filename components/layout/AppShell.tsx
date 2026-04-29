import Link from "next/link";
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
  { href: "/dashboard", label: "داشبورد" },
  { href: "/dashboard/application", label: "ثبت مدارک" },
];

const adminNav = [
  { href: "/admin", label: "نمای کلی" },
  { href: "/admin/submissions", label: "پرونده‌ها" },
];

export function AppShell({ area, eyebrow, title, description, action, children }: AppShellProps) {
  const nav = area === "admin" ? adminNav : userNav;

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="ناوبری">
        <Link href={area === "admin" ? "/admin" : "/dashboard"} className="app-brand">
          <span className="app-brand__mark">ث</span>
          <span>
            <strong>ثنا</strong>
            <small>{area === "admin" ? "پنل مدیریت" : "پنل متقاضی"}</small>
          </span>
        </Link>
        <nav className="app-nav">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="app-nav__link">
              {item.label}
            </Link>
          ))}
        </nav>
        <form action="/api/auth/logout" method="post" className="app-logout">
          <button type="submit">خروج</button>
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
          {nav.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
          <form action="/api/auth/logout" method="post">
            <button type="submit">خروج</button>
          </form>
        </nav>

        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
