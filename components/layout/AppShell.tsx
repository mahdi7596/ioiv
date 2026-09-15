import Image from "next/image";
import Link from "next/link";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { AppNav } from "./AppNav";

type AppShellProps = {
  area: "user" | "admin";
  eyebrow?: string;
  title?: string;
  description?: string;
  action?: ReactNode;
  stickyHeader?: boolean;
  children: ReactNode;
};

export function AppShell({ area, eyebrow, title, description, action, stickyHeader, children }: AppShellProps) {
  const isAdmin = area === "admin";

  return (
    <div className={`app-shell app-shell--${area}`}>
      <aside className="app-sidebar" aria-label="ناوبری">
        <Link href={isAdmin ? "/admin" : "/dashboard"} className="app-brand">
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
            <small>{isAdmin ? "پنل مدیریت" : "پنل متقاضی"}</small>
          </span>
        </Link>
        {isAdmin ? <p className="sidebar-section-label">منو</p> : null}
        <AppNav area={area} variant="sidebar" />
        <form action="/api/auth/logout" method="post" className="app-logout">
          <button type="submit" aria-label="خروج" title="خروج">
            <LogOut aria-hidden="true" size={18} strokeWidth={2} />
            <span>خروج</span>
          </button>
        </form>
        {isAdmin ? <p className="sidebar-foot">سامانه اعتبارسنجی سانا</p> : null}
      </aside>

      <div className="app-shell__main">
        <div className={stickyHeader ? "app-shell__top app-shell__top--sticky" : "app-shell__top"}>
          {title ? (
            <header className="app-header">
              <div>
                {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
                <h1>{title}</h1>
                {description ? <p className="app-header__description">{description}</p> : null}
              </div>
              {action ? <div className="app-header__action">{action}</div> : null}
            </header>
          ) : null}

          <nav className="mobile-nav" aria-label="ناوبری موبایل">
            <AppNav area={area} variant="mobile" />
          </nav>
        </div>

        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
