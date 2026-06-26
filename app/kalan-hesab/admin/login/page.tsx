"use client";

import Image from "next/image";
import { useState } from "react";
import { keepAsciiDigits } from "@/lib/input/digits";

export default function KalanHesabAdminLoginPage() {
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>();

  async function requestOtp() {
    setLoading(true);
    setMessage(undefined);
    try {
      const res = await fetch("/api/kalan-hesab/admin/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ارسال کد ناموفق بود");
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
      const res = await fetch("/api/kalan-hesab/admin/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ورود ناموفق بود");
      window.location.assign(data.redirectTo || "/admin");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا رخ داد");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-info" aria-labelledby="kh-admin-info-title">
        <p className="eyebrow">پنل مدیریت کلان حساب</p>
        <h1 id="kh-admin-info-title">ورود مدیران کلان حساب</h1>
        <p>
          مدیران فعال می‌توانند با شماره موبایل ثبت‌شده وارد پنل شوند
          و فرم‌های ثبت‌شده توسط متقاضیان را مشاهده کنند.
        </p>
        <div className="auth-info__steps" aria-label="دسترسی مدیریتی">
          <div>
            <span>۱</span>
            <strong>ورود با موبایل مدیر</strong>
            <small>کد تایید فقط برای مدیران فعال کلان حساب صادر می‌شود.</small>
          </div>
          <div>
            <span>۲</span>
            <strong>مشاهده فرم‌ها</strong>
            <small>تمام فرم‌های ثبت‌شده را جستجو و فیلتر کنید.</small>
          </div>
          <div>
            <span>۳</span>
            <strong>خروجی Excel</strong>
            <small>فهرست کامل فرم‌ها را به صورت فایل Excel دریافت کنید.</small>
          </div>
        </div>
      </section>

      <section className="auth-panel" aria-labelledby="kh-admin-form-title">
        <div className="auth-panel__header">
          <Image
            src="/kalan-hesab-logo.jpeg"
            alt="کلان حساب"
            width={160}
            height={80}
            className="auth-logo"
            priority
          />
          <p className="eyebrow">ورود مدیران</p>
          <h2 id="kh-admin-form-title">
            {otpSent ? "کد تایید را وارد کنید" : "شماره موبایل مدیر را وارد کنید"}
          </h2>
          <p>
            فقط شماره‌هایی که در فهرست مدیران فعال کلان حساب ثبت شده‌اند
            می‌توانند وارد پنل شوند.
          </p>
        </div>

        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void (otpSent ? verifyOtp() : requestOtp());
          }}
        >
          <div className="field" data-invalid={message && !otpSent ? "true" : undefined}>
            <label htmlFor="kh-admin-mobile">
              شماره موبایل <span className="text-red-600">*</span>
            </label>
            <input
              id="kh-admin-mobile"
              type="tel"
              dir="ltr"
              inputMode="numeric"
              autoComplete="tel"
              value={mobile}
              onChange={(e) => setMobile(keepAsciiDigits(e.target.value).slice(0, 11))}
              placeholder="09120000000"
              disabled={otpSent}
              maxLength={11}
            />
          </div>

          {otpSent ? (
            <div className="field" data-invalid={message ? "true" : undefined}>
              <label htmlFor="kh-admin-otp">
                کد تایید <span className="text-red-600">*</span>
              </label>
              <input
                id="kh-admin-otp"
                type="tel"
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(keepAsciiDigits(e.target.value).slice(0, 4))}
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
            {loading
              ? "در حال بررسی..."
              : otpSent
              ? "ورود به پنل مدیریت"
              : "دریافت کد تایید"}
          </button>

          {otpSent ? (
            <button
              type="button"
              onClick={() => {
                setOtpSent(false);
                setCode("");
                setMessage(undefined);
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
