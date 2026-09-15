"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Files, LayoutDashboard, LogOut } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavItem = { href: string; label: string; icon: LucideIcon };

const userNav: NavItem[] = [
  { href: "/dashboard", label: "داشبورد", icon: LayoutDashboard },
  { href: "/dashboard/facilities-profile", label: "پروفایل شرکت", icon: Building2 },
];

const adminNav: NavItem[] = [
  { href: "/admin", label: "نمای کلی", icon: LayoutDashboard },
  { href: "/admin/submissions", label: "پرونده‌ها", icon: Files },
];

function isActive(pathname: string, href: string, base: string) {
  if (href === base) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({ area, variant }: { area: "user" | "admin"; variant: "sidebar" | "mobile" }) {
  const pathname = usePathname() ?? "";
  const nav = area === "admin" ? adminNav : userNav;
  const base = area === "admin" ? "/admin" : "/dashboard";

  if (variant === "mobile") {
    return (
      <>
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              title={item.label}
              aria-current={isActive(pathname, item.href, base) ? "page" : undefined}
            >
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
      </>
    );
  }

  return (
    <nav className="app-nav">
      {nav.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="app-nav__link"
            aria-label={item.label}
            title={item.label}
            aria-current={isActive(pathname, item.href, base) ? "page" : undefined}
          >
            <Icon aria-hidden="true" size={18} strokeWidth={2} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
