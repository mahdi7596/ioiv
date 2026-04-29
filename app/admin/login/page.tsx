"use client";

import { useState } from "react";

export default function AdminLoginPage() {
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>();

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
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <form
        className="w-full max-w-sm space-y-5 rounded-lg border border-stone-200 bg-white p-6 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          void (otpSent ? verifyOtp() : requestOtp());
        }}
      >
        <div>
          <p className="text-sm font-semibold text-emerald-800">مدیریت سامانه</p>
          <h1 className="mt-2 text-2xl font-bold text-stone-950">ورود مدیران</h1>
        </div>
        <input
          dir="ltr"
          inputMode="numeric"
          value={mobile}
          onChange={(event) => setMobile(event.target.value)}
          placeholder="09120000000"
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-left"
        />
        {otpSent ? (
          <input
            dir="ltr"
            inputMode="numeric"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="1234"
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-center"
          />
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:bg-stone-400"
        >
          {otpSent ? "ورود" : "دریافت کد"}
        </button>
        {message ? <p className="text-sm text-red-700">{message}</p> : null}
      </form>
    </main>
  );
}
