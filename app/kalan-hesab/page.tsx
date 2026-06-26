"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { z } from "zod";

const step1Schema = z.object({
  fullName: z
    .string()
    .min(2, "نام و نام خانوادگی را وارد کنید")
    .regex(/^[؀-ۿ ]+$/, "لطفاً فقط حروف فارسی وارد کنید"),
  companyName: z.string().min(1, "نام شرکت یا برند را وارد کنید"),
  position: z.string().min(1, "سمت سازمانی را انتخاب کنید"),
  positionOther: z.string().optional(),
  teamSize: z.string().min(1, "اندازه تیم را انتخاب کنید"),
});

const step2Schema = z.object({
  mainConcern: z.string().min(1, "دغدغه خود را انتخاب کنید"),
  concernOther: z.string().optional(),
  mobile: z.string().regex(/^09\d{9}$/, "شماره موبایل معتبر نیست"),
});

type Step1Errors = Partial<Record<keyof z.infer<typeof step1Schema>, string>>;
type Step2Errors = Partial<Record<keyof z.infer<typeof step2Schema>, string>>;
type FormErrors = Step1Errors & Step2Errors;

const POSITIONS = ["مدیرعامل", "عضو هیئت مدیره", "مدیرمالی", "صاحب کسب‌وکار", "سایر"] as const;
const TEAM_SIZES = ["کمتر از ۱۰", "۱۰ تا ۵۰", "۵۰ تا ۲۰۰", "بیش از ۲۰۰"] as const;
const CONCERNS = [
  "مدیریت مالی",
  "مالیات",
  "تامین اجتماعی",
  "گزارشات مدیریتی",
  "حسابرسی",
  "تامین مالی",
  "سایر",
] as const;

function ChipGroup({
  options,
  value,
  onChange,
  error,
  cols = 2,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
  cols?: 2 | 4;
}) {
  return (
    <div>
      <div className={`kh-chips kh-chips--${cols}`}>
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`kh-chip${value === opt ? " kh-chip--on" : ""}`}
            aria-pressed={value === opt}
            onClick={() => onChange(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
      {error && <p className="kh-err">{error}</p>}
    </div>
  );
}

export default function KalanHesabPage() {
  const [step, setStep] = useState<1 | 2>(1);

  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [position, setPosition] = useState("");
  const [positionOther, setPositionOther] = useState("");
  const [teamSize, setTeamSize] = useState("");

  const [mainConcern, setMainConcern] = useState("");
  const [concernOther, setConcernOther] = useState("");
  const [mobile, setMobile] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (!submitted) return;
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          window.location.href = "https://kalanhesab.com/";
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [submitted]);
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  const [persianHint, setPersianHint] = useState(false);
  const persianHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [step1ShakeCount, setStep1ShakeCount] = useState(0);
  const [step2ShakeCount, setStep2ShakeCount] = useState(0);

  // Alternating classes let React restart the animation even on repeated rapid clicks
  function shakeClass(count: number) {
    if (count === 0) return "";
    return count % 2 === 1 ? " kh-shake-a" : " kh-shake-b";
  }

  const dl = (i: number) => ({ animationDelay: `${i * 80}ms` });

  function validateStep1(): boolean {
    const result = step1Schema.safeParse({
      fullName,
      companyName,
      position,
      positionOther: positionOther || undefined,
      teamSize,
    });
    if (result.success) {
      setFormErrors({});
      return true;
    }
    const errs: Step1Errors = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof Step1Errors;
      if (!errs[key]) errs[key] = issue.message;
    }
    setFormErrors(errs);
    setStep1ShakeCount((c) => c + 1);
    return false;
  }

  async function handleSubmit() {
    setFormErrors({});
    setSubmitError("");
    const result = step2Schema.safeParse({
      mainConcern,
      concernOther: concernOther || undefined,
      mobile,
    });
    if (!result.success) {
      const errs: Step2Errors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof Step2Errors;
        if (!errs[key]) errs[key] = issue.message;
      }
      setFormErrors(errs);
      setStep2ShakeCount((c) => c + 1);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/kalan-hesab/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          companyName,
          position,
          positionOther: positionOther || undefined,
          teamSize,
          mainConcern: result.data.mainConcern,
          concernOther: result.data.concernOther,
          mobile: result.data.mobile,
        }),
      });
      const data = await res.json();
      if (res.ok) setSubmitted(true);
      else setSubmitError(data.error ?? "خطا در ثبت اطلاعات");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="kh-page" dir="rtl">
        <div className="kh-ok">
          <div className="kh-ok__ring">
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
              <path
                d="M9 22L19 32L35 12"
                stroke="#fff"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="kh-ok__title">فرهیخته گرامی، {fullName}</h2>
          <p className="kh-ok__body">
            ضمن تشکر از اعتماد شما، متخصصان ما در اولین فرصت با شما تماس خواهند گرفت.
          </p>
          <p className="kh-ok__sig">
            شرکت خدمات مالی و مالیاتی
            <br />
            کلان حساب
          </p>
          <p className="kh-ok__redirect">
            در {countdown.toLocaleString("fa-IR")} ثانیه به سایت اصلی منتقل می‌شوید
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="kh-page" dir="rtl">
      {/* ── Hero ── */}
      <header className="kh-hero">
        <Image
          src="/kalanhesab/kalan-hesab-main-logo.png"
          alt="کلان حساب"
          width={220}
          height={80}
          className="kh-logo"
          priority
        />
        <h1 className="kh-hero__h">مدیران موفق، قبل از بحران تصمیم می‌گیرند</h1>
        <p className="kh-hero__sub">
          وضعیت مالی و مالیاتی کسب‌وکار خود را با کارشناسان ما بررسی کنید.
        </p>
        <ul className="kh-hero__badges" aria-label="مزایا">
          <li>بررسی اولیه مالی و مالیاتی</li>
          <li>شناسایی ریسک‌های احتمالی</li>
          <li>پیشنهادهای بهبود مدیریتی</li>
        </ul>
      </header>

      {/* ── Form card ── */}
      <main className="kh-card">
        {/* Step progress */}
        <nav className="kh-steps" aria-label="مراحل فرم">
          <div
            className={`kh-steps__node${step >= 1 ? " kh-steps__node--active" : ""}${step > 1 ? " kh-steps__node--done" : ""}`}
          >
            <div className="kh-steps__dot" aria-current={step === 1 ? "step" : undefined}>
              {step > 1 ? (
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-label="تکمیل شد">
                  <path
                    d="M2.5 7.5L6.5 11.5L12.5 3.5"
                    stroke="#fff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                "۱"
              )}
            </div>
            <span className="kh-steps__lbl">اطلاعات شما</span>
          </div>

          <div className={`kh-steps__track${step >= 2 ? " kh-steps__track--on" : ""}`} />

          <div className={`kh-steps__node${step >= 2 ? " kh-steps__node--active" : ""}`}>
            <div className="kh-steps__dot" aria-current={step === 2 ? "step" : undefined}>
              ۲
            </div>
            <span className="kh-steps__lbl">دغدغه و تماس</span>
          </div>
        </nav>

        {/* ── Step 1 ── */}
        {step === 1 && (
          <div className="kh-body">
            <div className="step-in" style={dl(0)}>
              <p className="kh-body__eyebrow">مرحله ۱ از ۲</p>
              <h2 className="kh-body__h">کسب‌وکار شما را بهتر بشناسیم</h2>
            </div>

            <div
              className="kh-field step-in"
              style={dl(1)}
              data-invalid={!!formErrors.fullName || undefined}
            >
              <label htmlFor="fullName" className="kh-lbl">
                نام و نام خانوادگی
              </label>
              <input
                id="fullName"
                type="text"
                className="kh-input"
                placeholder="علی رضایی"
                value={fullName}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (/[^؀-ۿ ]/.test(raw)) {
                    setPersianHint(true);
                    if (persianHintTimer.current) clearTimeout(persianHintTimer.current);
                    persianHintTimer.current = setTimeout(() => setPersianHint(false), 3000);
                  }
                  const v = raw.replace(/[^؀-ۿ ]/g, "");
                  setFullName(v);
                  if (formErrors.fullName)
                    setFormErrors((prev) => ({ ...prev, fullName: undefined }));
                }}
              />
              {formErrors.fullName && <p className="kh-err">{formErrors.fullName}</p>}
              {persianHint && !formErrors.fullName && (
                <p className="kh-hint">نام و نام خانوادگی فقط با حروف فارسی قابل ثبت است</p>
              )}
            </div>

            <div
              className="kh-field step-in"
              style={dl(2)}
              data-invalid={!!formErrors.companyName || undefined}
            >
              <label htmlFor="companyName" className="kh-lbl">
                نام شرکت یا برند
              </label>
              <input
                id="companyName"
                type="text"
                className="kh-input"
                placeholder="شرکت آریا صنعت"
                value={companyName}
                onChange={(e) => {
                  setCompanyName(e.target.value);
                  if (formErrors.companyName)
                    setFormErrors((prev) => ({ ...prev, companyName: undefined }));
                }}
              />
              {formErrors.companyName && <p className="kh-err">{formErrors.companyName}</p>}
            </div>

            <div
              className="kh-field step-in"
              style={dl(3)}
              data-invalid={!!formErrors.position || undefined}
            >
              <label className="kh-lbl">سمت سازمانی</label>
              <ChipGroup
                options={POSITIONS}
                value={position}
                onChange={(v) => {
                  setPosition(v);
                  if (formErrors.position)
                    setFormErrors((prev) => ({ ...prev, position: undefined }));
                }}
                error={formErrors.position}
                cols={2}
              />
              {position === "سایر" && (
                <input
                  type="text"
                  className="kh-input kh-input--sm"
                  placeholder="سمت خود را بنویسید"
                  value={positionOther}
                  onChange={(e) => setPositionOther(e.target.value)}
                  style={{ marginTop: 10 }}
                />
              )}
            </div>

            <div
              className="kh-field step-in"
              style={dl(4)}
              data-invalid={!!formErrors.teamSize || undefined}
            >
              <label className="kh-lbl">اندازه تیم</label>
              <ChipGroup
                options={TEAM_SIZES}
                value={teamSize}
                onChange={(v) => {
                  setTeamSize(v);
                  if (formErrors.teamSize)
                    setFormErrors((prev) => ({ ...prev, teamSize: undefined }));
                }}
                error={formErrors.teamSize}
                cols={4}
              />
            </div>

            <div className="step-in" style={dl(5)}>
              <button
                type="button"
                className={`kh-btn kh-btn--primary${shakeClass(step1ShakeCount)}`}
                disabled={!!(formErrors.fullName || formErrors.companyName || formErrors.position || formErrors.teamSize)}
                onAnimationEnd={(e) => {
                  if (e.animationName === "kh-shake") setStep1ShakeCount(0);
                }}
                onClick={() => {
                  if (validateStep1()) setStep(2);
                }}
              >
                ادامه
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M11 4.5L6.5 9L11 13.5"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2 ── */}
        {step === 2 && (
          <div className="kh-body">
            <div className="step-in" style={dl(0)}>
              <p className="kh-body__eyebrow">مرحله ۲ از ۲</p>
              <h2 className="kh-body__h">چطور می‌توانیم کمک کنیم؟</h2>
            </div>

            <div
              className="kh-field step-in"
              style={dl(1)}
              data-invalid={!!formErrors.mainConcern || undefined}
            >
              <label className="kh-lbl">بزرگترین دغدغه‌تان کدام است؟</label>
              <ChipGroup
                options={CONCERNS}
                value={mainConcern}
                onChange={setMainConcern}
                error={formErrors.mainConcern}
                cols={2}
              />
              {mainConcern === "سایر" && (
                <input
                  type="text"
                  className="kh-input kh-input--sm"
                  placeholder="دغدغه خود را بنویسید"
                  value={concernOther}
                  onChange={(e) => setConcernOther(e.target.value)}
                  style={{ marginTop: 10 }}
                />
              )}
            </div>

            <div
              className="kh-field step-in"
              style={dl(2)}
              data-invalid={!!formErrors.mobile || undefined}
            >
              <label htmlFor="mobile" className="kh-lbl">
                شماره موبایل
              </label>
              <input
                id="mobile"
                type="tel"
                className="kh-input"
                placeholder="09xxxxxxxxx"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
              />
              {formErrors.mobile && <p className="kh-err">{formErrors.mobile}</p>}
            </div>

            {submitError && (
              <p className="kh-err kh-err--block step-in">{submitError}</p>
            )}

            <div className="kh-actions step-in" style={dl(3)}>
              <button
                type="button"
                className="kh-btn kh-btn--ghost"
                onClick={() => {
                  setStep(1);
                  setFormErrors({});
                }}
                disabled={submitting}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M7 4.5L11.5 9L7 13.5"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                بازگشت
              </button>
              <button
                type="button"
                className={`kh-btn kh-btn--primary${shakeClass(step2ShakeCount)}`}
                onAnimationEnd={(e) => {
                  if (e.animationName === "kh-shake") setStep2ShakeCount(0);
                }}
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <span className="kh-spin" aria-label="در حال ثبت..." />
                ) : (
                  "دریافت ارزیابی تخصصی"
                )}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
