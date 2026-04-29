"use client";

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
          inputMode="numeric"
          dir="ltr"
          value={mobile}
          onChange={(event) => onMobileChange(event.target.value)}
          placeholder="09123456789"
        />
        {error ? <p className="field__hint">{error}</p> : null}
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
