"use client";

import { useState } from "react";

export default function AdminLoginPage() {
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>();
  const [devOtp, setDevOtp] = useState<string>();

  async function requestOtp() {
    setLoading(true);
    setMessage(undefined);

    try {
      const response = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, mode: "admin" }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "ارسال کد ناموفق بود");
      setDevOtp(data.devOtp);
      setOtpSent(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا رخ داد");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    setMessage(undefined);

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, code, mode: "admin" }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "ورود ناموفق بود");
      window.location.assign(data.redirectTo || "/admin");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا رخ داد");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-info" aria-labelledby="admin-auth-info-title">
        <p className="eyebrow">مدیریت سامانه</p>
        <h1 id="admin-auth-info-title">ورود امن مدیران برای بررسی پرونده‌ها</h1>
        <p>
          مدیران فعال می‌توانند با شماره موبایل ثبت‌شده وارد پنل شوند، وضعیت پرونده‌ها را بررسی
          کنند و نتیجه بررسی را برای متقاضی ثبت کنند.
        </p>
        <div className="auth-info__steps" aria-label="دسترسی‌های مدیریتی">
          <div>
            <span>۱</span>
            <strong>ورود با موبایل مدیر</strong>
            <small>کد تایید فقط برای مدیران فعال صادر می‌شود.</small>
          </div>
          <div>
            <span>۲</span>
            <strong>بررسی پرونده‌ها</strong>
            <small>مدارک، پرداخت و سوابق هر پرونده را یک‌جا ببینید.</small>
          </div>
          <div>
            <span>۳</span>
            <strong>ثبت نتیجه</strong>
            <small>وضعیت و یادداشت اصلاح یا رد را برای کاربر ثبت کنید.</small>
          </div>
        </div>
      </section>

      <section className="auth-panel" aria-labelledby="admin-auth-form-title">
        <div className="auth-panel__header">
          <p className="eyebrow">ورود مدیران</p>
          <h2 id="admin-auth-form-title">
            {otpSent ? "کد تایید را وارد کنید" : "شماره موبایل مدیر را وارد کنید"}
          </h2>
          <p>
            فقط شماره‌هایی که در فهرست مدیران فعال ثبت شده‌اند امکان ورود به پنل مدیریت را دارند.
          </p>
        </div>

        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void (otpSent ? verifyOtp() : requestOtp());
          }}
        >
          {devOtp ? (
            <div className="dev-otp-box">
              <span>کد آزمایشی برای ورود</span>
              <strong dir="ltr">{devOtp}</strong>
            </div>
          ) : null}

          <div className="field" data-invalid={message && !otpSent ? "true" : undefined}>
            <label htmlFor="admin-mobile">
              شماره موبایل <span className="text-red-600">*</span>
            </label>
            <input
              id="admin-mobile"
              dir="ltr"
              inputMode="numeric"
              value={mobile}
              onChange={(event) => setMobile(event.target.value)}
              placeholder="09120000000"
              disabled={otpSent}
            />
          </div>

          {otpSent ? (
            <div className="field" data-invalid={message ? "true" : undefined}>
              <label htmlFor="admin-otp">
                کد تایید <span className="text-red-600">*</span>
              </label>
              <input
                id="admin-otp"
                dir="ltr"
                inputMode="numeric"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="1234"
                maxLength={4}
                className="text-center text-xl"
              />
              {message ? <p className="field__hint">{message}</p> : null}
            </div>
          ) : message ? (
            <p className="field__hint text-red-700">{message}</p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="button button--primary w-full"
          >
            {loading ? "در حال بررسی..." : otpSent ? "ورود به پنل مدیریت" : "دریافت کد تایید"}
          </button>

          {otpSent ? (
            <button
              type="button"
              onClick={() => {
                setOtpSent(false);
                setCode("");
                setMessage(undefined);
                setDevOtp(undefined);
              }}
              className="button button--ghost w-full"
            >
              تغییر شماره
            </button>
          ) : null}
        </form>
      </section>
    </main>
  );
}
