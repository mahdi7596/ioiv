"use client";

import { useState, useMemo } from "react";
import Image from "next/image";

type Submission = {
  id: string;
  fullName: string;
  companyName: string;
  position: string;
  positionOther: string | null;
  teamSize: string;
  mainConcern: string;
  concernOther: string | null;
  mobile: string;
  createdAt: string;
};

export function KalanHesabAdminContent({
  adminMobile,
  submissions,
}: {
  adminMobile: string;
  submissions: Submission[];
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return submissions;
    return submissions.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.companyName.toLowerCase().includes(q) ||
        s.mobile.includes(q),
    );
  }, [search, submissions]);

  return (
    <div className="kh-admin-page">
      <header className="kh-admin-header">
        <Image
          src="/kalan-hesab-logo.jpeg"
          alt="کلان حساب"
          width={120}
          height={60}
          className="kh-logo"
        />
        <span className="kh-admin-mobile" dir="ltr">{adminMobile}</span>
        <form method="POST" action="/api/kalan-hesab/admin/logout">
          <button type="submit" className="button button--ghost">خروج</button>
        </form>
      </header>

      <div className="kh-admin-toolbar">
        <div className="kh-admin-search">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو در نام، شرکت یا موبایل..."
            className="kh-input"
            dir="rtl"
          />
        </div>
        <a href="/api/kalan-hesab/admin/export" className="button">
          دریافت Excel
        </a>
      </div>

      <div className="kh-admin-table-wrap">
        <table className="data-table" dir="rtl">
          <thead>
            <tr>
              <th>نام و نام خانوادگی</th>
              <th>نام شرکت</th>
              <th>سمت</th>
              <th>اندازه تیم</th>
              <th>دغدغه</th>
              <th>موبایل</th>
              <th>تاریخ ثبت</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center" }}>
                  {search ? "نتیجه‌ای یافت نشد." : "هنوز فرمی ثبت نشده است."}
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id}>
                  <td>{s.fullName}</td>
                  <td>{s.companyName}</td>
                  <td>{s.position === "سایر" && s.positionOther ? s.positionOther : s.position}</td>
                  <td>{s.teamSize}</td>
                  <td>{s.mainConcern === "سایر" && s.concernOther ? s.concernOther : s.mainConcern}</td>
                  <td dir="ltr">{s.mobile}</td>
                  <td dir="ltr">{s.createdAt}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
