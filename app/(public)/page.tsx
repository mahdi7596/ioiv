import { AuthFlow } from "@/components/auth/AuthFlow";

export default function Home() {
  return (
    <main className="auth-page">
      <section className="auth-info" aria-labelledby="auth-info-title">
        <p className="eyebrow">سامانه ثبت و بررسی</p>
        <h1 id="auth-info-title">ثبت مدارک شرکت و پیگیری وضعیت پرونده</h1>
        <p>
          در این سامانه مدارک مورد نیاز را مرحله به مرحله بارگذاری می‌کنید، وضعیت بررسی را دنبال
          می‌کنید و پیام‌های کارشناسی را بدون مراجعه حضوری دریافت می‌کنید.
        </p>
        <div className="auth-info__steps" aria-label="مراحل اصلی">
          <div>
            <span>۱</span>
            <strong>ورود با موبایل</strong>
            <small>کد تایید برای شماره شما صادر می‌شود.</small>
          </div>
          <div>
            <span>۲</span>
            <strong>تکمیل مدارک</strong>
            <small>اظهارنامه، صورت‌های مالی و گزارش‌ها را ثبت کنید.</small>
          </div>
          <div>
            <span>۳</span>
            <strong>بررسی و نتیجه</strong>
            <small>وضعیت پرونده و یادداشت کارشناس را از داشبورد ببینید.</small>
          </div>
        </div>
      </section>

      <section className="auth-panel" aria-labelledby="auth-form-title">
        <div className="auth-panel__header">
          <p className="eyebrow">ورود متقاضی</p>
          <h2 id="auth-form-title">شماره موبایل خود را وارد کنید</h2>
          <p>
            اگر قبلا ثبت‌نام کرده باشید وارد داشبورد می‌شوید؛ در غیر این صورت شناسه ملی شرکت را
            بعد از تایید کد وارد می‌کنید.
          </p>
        </div>
        <AuthFlow />
      </section>
    </main>
  );
}
