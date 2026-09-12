"use client";

export default function FacilitiesApplicationsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="app-content">
      <section className="panel" role="alert">
        <h1>دسترسی یا بارگذاری پرونده‌های تسهیلات ممکن نیست</h1>
        <p>دسترسی این بخش فقط برای مدیران فعال مجاز است. اگر دسترسی دارید، بارگذاری را دوباره امتحان کنید.</p>
        <button className="button button--primary" type="button" onClick={reset}>تلاش مجدد</button>
      </section>
    </main>
  );
}
