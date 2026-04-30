"use client";

import { keepAsciiDigits } from "@/lib/input/digits";

type RegistrationFormProps = {
  companyNationalId: string;
  error?: string;
  onCompanyNationalIdChange: (value: string) => void;
};

export function RegistrationForm({
  companyNationalId,
  error,
  onCompanyNationalIdChange,
}: RegistrationFormProps) {
  return (
    <div className="field" data-invalid={error ? "true" : undefined}>
      <label htmlFor="companyNationalId">
        شناسه ملی شرکت <span className="text-red-600">*</span>
      </label>
      <input
        id="companyNationalId"
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        dir="ltr"
        value={companyNationalId}
        onChange={(event) => onCompanyNationalIdChange(keepAsciiDigits(event.target.value).slice(0, 11))}
        placeholder="12345678901"
        maxLength={11}
      />
      {error ? <p className="field__hint">{error}</p> : null}
    </div>
  );
}
