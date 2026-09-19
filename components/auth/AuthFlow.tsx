"use client";

import { useEffect, useState } from "react";
import { showToast } from "@/components/ui/toast";
import { MobileEntryForm } from "./MobileEntryForm";
import { OtpForm } from "./OtpForm";

type Step = "mobile" | "otp";

export function AuthFlow() {
  const [step, setStep] = useState<Step>("mobile");
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  useEffect(() => {
    if (secondsRemaining <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSecondsRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [secondsRemaining]);

  async function requestOtp() {
    setLoading(true);
    setError(undefined);

    // Allow the bounded provider call and database operations to finish.
    const timeout = AbortSignal.timeout(45000);

    try {
      const response = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, mode: "user" }),
        signal: timeout,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "ارسال کد تایید ناموفق بود");
      }

      setStep("otp");
      setSecondsRemaining(90);
      setError(data.warning);
      showToast({ type: data.warning ? "error" : "success", message: data.warning || "کد تایید ارسال شد" });
    } catch (requestError) {
      const uncertain = requestError instanceof SyntaxError || requestError instanceof TypeError || (requestError instanceof DOMException && requestError.name === "TimeoutError");
      const errorMessage =
        uncertain
          ? "نتیجه ارسال مشخص نیست. اگر پیامک رسید کد را وارد کنید؛ برای ارسال مجدد ۹۰ ثانیه صبر کنید."
          : requestError instanceof Error
            ? requestError.message
            : "خطای غیرمنتظره رخ داد";
      if (uncertain) {
        setStep("otp");
        setSecondsRemaining(90);
      }
      setError(errorMessage);
      showToast({ type: "error", message: errorMessage });
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    setError(undefined);

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, code, mode: "user" }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "کد تایید معتبر نیست");
      }

      showToast({ type: "success", message: "ورود با موفقیت انجام شد" });
      window.location.assign(data.redirectTo || "/dashboard");
    } catch (verifyError) {
      // Start retries empty: editing a complete rejected code must not auto-submit
      // each intermediate six-digit value and spend the remaining guesses.
      setCode("");
      const errorMessage = verifyError instanceof Error ? verifyError.message : "خطای غیرمنتظره رخ داد";
      setError(errorMessage);
      showToast({ type: "error", message: errorMessage });
    } finally {
      setLoading(false);
    }
  }

  if (step === "otp") {
    return (
      <OtpForm
        code={code}
        error={error}
        loading={loading}
        canResend={secondsRemaining === 0}
        secondsRemaining={secondsRemaining}
        onCodeChange={setCode}
        onSubmit={verifyOtp}
        onResend={requestOtp}
        onBack={() => {
          setStep("mobile");
          setCode("");
          setError(undefined);
        }}
      />
    );
  }

  return (
    <MobileEntryForm
      mobile={mobile}
      error={error}
      loading={loading}
      onMobileChange={setMobile}
      onSubmit={requestOtp}
    />
  );
}
