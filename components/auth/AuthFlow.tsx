"use client";

import { useEffect, useState } from "react";
import { showToast } from "@/components/ui/toast";
import { MobileEntryForm } from "./MobileEntryForm";
import { OtpForm } from "./OtpForm";
import { RegistrationForm } from "./RegistrationForm";

type Step = "mobile" | "otp";

export function AuthFlow() {
  const [step, setStep] = useState<Step>("mobile");
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [companyNationalId, setCompanyNationalId] = useState("");
  const [requiresRegistration, setRequiresRegistration] = useState(false);
  const [devOtp, setDevOtp] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [registrationError, setRegistrationError] = useState<string>();
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
    setRegistrationError(undefined);

    try {
      const response = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, mode: "user" }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "ارسال کد تایید ناموفق بود");
      }

      setRequiresRegistration(data.next === "register");
      setDevOtp(data.devOtp);
      setStep("otp");
      setSecondsRemaining(120);
      showToast({ type: "success", message: "کد تایید ارسال شد" });
    } catch (requestError) {
      const errorMessage = requestError instanceof Error ? requestError.message : "خطای غیرمنتظره رخ داد";
      setError(errorMessage);
      showToast({ type: "error", message: errorMessage });
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    setError(undefined);
    setRegistrationError(undefined);

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile,
          code,
          mode: "user",
          companyNationalId: requiresRegistration ? companyNationalId : undefined,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (requiresRegistration && String(data.error || "").includes("شناسه")) {
          setRegistrationError(data.error);
          return;
        }

        throw new Error(data.error || "کد تایید معتبر نیست");
      }

      showToast({
        type: "success",
        message: requiresRegistration ? "ثبت‌نام با موفقیت انجام شد" : "ورود با موفقیت انجام شد",
      });
      window.location.assign(data.redirectTo || "/dashboard");
    } catch (verifyError) {
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
        devOtp={devOtp}
        error={error}
        loading={loading}
        canResend={secondsRemaining === 0}
        secondsRemaining={secondsRemaining}
        showRegistration={requiresRegistration}
        onCodeChange={setCode}
        onSubmit={verifyOtp}
        onResend={requestOtp}
        onBack={() => {
          setStep("mobile");
          setCode("");
          setError(undefined);
        }}
      >
        <RegistrationForm
          companyNationalId={companyNationalId}
          error={registrationError}
          onCompanyNationalIdChange={setCompanyNationalId}
        />
      </OtpForm>
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
