import Image from "next/image";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export default async function KalanHesabAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const session = await getSession();
  if (!session || session.kind !== "admin") {
    redirect("/admin/login");
  }

  const admin = await db.admin.findUnique({ where: { id: session.subjectId } });
  if (!admin || !admin.active || admin.role !== UserRole.KALAN_HESAB_ADMIN) {
    redirect("/admin/login");
  }

  const { search } = await searchParams;
  const submissions = await db.kalanHesabSubmission.findMany({
    where: search
      ? {
          OR: [
            { fullName: { contains: search } },
            { companyName: { contains: search } },
            { mobile: { contains: search } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="kh-admin-page">
      <header className="kh-admin-header">
        <Image
          src="/kalan-hesab-logo.jpeg"
          alt="کالان حساب"
          width={120}
          height={60}
          className="kh-logo"
        />
        <span className="kh-admin-mobile" dir="ltr">{admin.mobile}</span>
        <form method="POST" action="/api/kalan-hesab/admin/logout">
          <button type="submit" className="button button--ghost">
            خروج
          </button>
        </form>
      </header>

      <div className="kh-admin-toolbar">
        <form method="GET" action="/admin" className="kh-admin-search">
          <input
            type="search"
            name="search"
            defaultValue={search}
            placeholder="جستجو در نام، شرکت یا موبایل..."
            className="kh-input"
            dir="rtl"
          />
          <button type="submit" className="button button--primary">
            جستجو
          </button>
        </form>
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
            {submissions.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center" }}>
                  {search ? "نتیجه‌ای یافت نشد." : "هنوز فرمی ثبت نشده است."}
                </td>
              </tr>
            ) : (
              submissions.map((s) => (
                <tr key={s.id}>
                  <td>{s.fullName}</td>
                  <td>{s.companyName}</td>
                  <td>
                    {s.position === "سایر" && s.positionOther
                      ? s.positionOther
                      : s.position}
                  </td>
                  <td>{s.teamSize}</td>
                  <td>
                    {s.mainConcern === "سایر" && s.concernOther
                      ? s.concernOther
                      : s.mainConcern}
                  </td>
                  <td dir="ltr">{s.mobile}</td>
                  <td dir="ltr">{s.createdAt.toLocaleDateString("fa-IR")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
