"use client";

import { keepAsciiDigits } from "@/lib/input/digits";

type MobileEntryFormProps = {
  mobile: string;
  error?: string;
  loading?: boolean;
  onMobileChange: (mobile: string) => void;
  onSubmit: () => void;
};

export function MobileEntryForm({
  mobile,
  error,
  loading,
  onMobileChange,
  onSubmit,
}: MobileEntryFormProps) {
  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="field" data-invalid={error ? "true" : undefined}>
        <label htmlFor="mobile">
          شماره موبایل <span className="text-red-600">*</span>
        </label>
        <input
          id="mobile"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          dir="ltr"
          value={mobile}
          onChange={(event) => onMobileChange(keepAsciiDigits(event.target.value).slice(0, 11))}
          placeholder="09123456789"
          maxLength={11}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "mobile-error" : undefined}
        />
        {error ? <p id="mobile-error" className="field__hint" role="alert">{error}</p> : null}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="button button--primary w-full"
      >
        {loading ? "در حال ارسال..." : "دریافت کد تایید"}
      </button>
    </form>
  );
}
