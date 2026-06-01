"use client";

import { useEffect, useState } from "react";
import { showToast } from "@/components/ui/toast";
import { MobileEntryForm } from "./MobileEntryForm";
import { OtpForm } from "./OtpForm";
import { RegistrationForm, getCompanyNationalIdInlineError } from "./RegistrationForm";

type Step = "mobile" | "otp";

export function AuthFlow() {
  const [step, setStep] = useState<Step>("mobile");
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyNationalId, setCompanyNationalId] = useState("");
  const [companyContactFullName, setCompanyContactFullName] = useState("");
  const [companyContactNationalCode, setCompanyContactNationalCode] = useState("");
  const [requiresRegistration, setRequiresRegistration] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [registrationError, setRegistrationError] = useState<string>();
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const companyNationalIdInlineError = requiresRegistration
    ? getCompanyNationalIdInlineError(companyNationalId)
    : undefined;

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

      setRequiresRegistration(false);
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
    if (companyNationalIdInlineError) {
      setRegistrationError(companyNationalIdInlineError);
      return;
    }

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
          companyName: requiresRegistration ? companyName : undefined,
          companyNationalId: requiresRegistration ? companyNationalId : undefined,
          companyContactFullName: requiresRegistration ? companyContactFullName : undefined,
          companyContactNationalCode: requiresRegistration ? companyContactNationalCode : undefined,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (requiresRegistration) {
          setRegistrationError(data.error);
          return;
        }

        throw new Error(data.error || "کد تایید معتبر نیست");
      }

      if (data.next === "register") {
        setRequiresRegistration(true);
        setRegistrationError("اطلاعات شرکت و رابط شرکت را برای تکمیل ثبت‌نام وارد کنید");
        return;
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
        error={error}
        loading={loading}
        canResend={secondsRemaining === 0}
        secondsRemaining={secondsRemaining}
        showRegistration={requiresRegistration}
        canSubmit={!companyNationalIdInlineError}
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
          companyName={companyName}
          companyNationalId={companyNationalId}
          companyContactFullName={companyContactFullName}
          companyContactNationalCode={companyContactNationalCode}
          error={registrationError}
          companyNationalIdError={companyNationalIdInlineError}
          onCompanyNameChange={setCompanyName}
          onCompanyNationalIdChange={setCompanyNationalId}
          onCompanyContactFullNameChange={setCompanyContactFullName}
          onCompanyContactNationalCodeChange={setCompanyContactNationalCode}
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
