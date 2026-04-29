"use client";

type OtpFormProps = {
  code: string;
  devOtp?: string;
  error?: string;
  loading?: boolean;
  canResend?: boolean;
  secondsRemaining: number;
  showRegistration?: boolean;
  children?: React.ReactNode;
  onCodeChange: (code: string) => void;
  onSubmit: () => void;
  onResend: () => void;
  onBack: () => void;
};

export function OtpForm({
  code,
  devOtp,
  error,
  loading,
  canResend,
  secondsRemaining,
  showRegistration,
  children,
  onCodeChange,
  onSubmit,
  onResend,
  onBack,
}: OtpFormProps) {
  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {devOtp ? (
        <div className="dev-otp-box">
          <span>کد آزمایشی برای ورود</span>
          <strong dir="ltr">{devOtp}</strong>
        </div>
      ) : null}

      {showRegistration ? children : null}

      <div className="field" data-invalid={error ? "true" : undefined}>
        <label htmlFor="otp">
          کد تایید <span className="text-red-600">*</span>
        </label>
        <input
          id="otp"
          inputMode="numeric"
          dir="ltr"
          value={code}
          onChange={(event) => onCodeChange(event.target.value)}
          placeholder="1234"
          maxLength={4}
          className="text-center text-xl"
        />
        {error ? <p className="field__hint">{error}</p> : null}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="button button--primary w-full"
      >
        {loading ? "در حال بررسی..." : "ورود به سامانه"}
      </button>

      <div className="flex items-center justify-between gap-3 text-sm">
        <button type="button" onClick={onBack} className="text-stone-700 hover:text-stone-950">
          تغییر شماره
        </button>
        <button
          type="button"
          onClick={onResend}
          disabled={!canResend || loading}
          className="text-emerald-800 hover:text-emerald-950 disabled:cursor-not-allowed disabled:text-stone-400"
        >
          {canResend ? "ارسال مجدد کد" : `ارسال مجدد تا ${secondsRemaining} ثانیه`}
        </button>
      </div>
    </form>
  );
}
