"use client";

import { keepAsciiDigits } from "@/lib/input/digits";

const COMPANY_NATIONAL_ID_LENGTH_ERROR = "شناسه ملی شرکت باید ۱۰ یا ۱۱ رقم باشد";

type RegistrationFormProps = {
  companyName: string;
  companyNationalId: string;
  companyContactFullName: string;
  companyContactNationalCode: string;
  error?: string;
  companyNationalIdError?: string;
  onCompanyNameChange: (value: string) => void;
  onCompanyNationalIdChange: (value: string) => void;
  onCompanyContactFullNameChange: (value: string) => void;
  onCompanyContactNationalCodeChange: (value: string) => void;
};

export function getCompanyNationalIdInlineError(value: string) {
  const digits = keepAsciiDigits(value);

  if (!digits) {
    return undefined;
  }

  return /^\d{10,11}$/.test(digits) ? undefined : COMPANY_NATIONAL_ID_LENGTH_ERROR;
}

export function RegistrationForm({
  companyName,
  companyNationalId,
  companyContactFullName,
  companyContactNationalCode,
  error,
  companyNationalIdError,
  onCompanyNameChange,
  onCompanyNationalIdChange,
  onCompanyContactFullNameChange,
  onCompanyContactNationalCodeChange,
}: RegistrationFormProps) {
  const nationalIdError = companyNationalIdError ?? getCompanyNationalIdInlineError(companyNationalId);

  return (
    <div className="stack" data-invalid={error ? "true" : undefined}>
      <div className="field">
        <label htmlFor="companyName">
          نام شرکت <span className="text-red-600">*</span>
        </label>
        <input
          id="companyName"
          type="text"
          value={companyName}
          onChange={(event) => onCompanyNameChange(event.target.value)}
          required
        />
      </div>

      <div className="field" data-invalid={nationalIdError ? "true" : undefined}>
        <label htmlFor="companyNationalId">
          شناسه ملی شرکت <span className="text-red-600">*</span>
        </label>
        <input
          id="companyNationalId"
          type="tel"
          inputMode="numeric"
          dir="ltr"
          value={companyNationalId}
          onChange={(event) => onCompanyNationalIdChange(keepAsciiDigits(event.target.value))}
          placeholder="12345678901"
          required
        />
        {nationalIdError ? <p className="field__hint">{nationalIdError}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="companyContactFullName">
          نام و نام خانوادگی رابط شرکت <span className="text-red-600">*</span>
        </label>
        <input
          id="companyContactFullName"
          type="text"
          value={companyContactFullName}
          onChange={(event) => onCompanyContactFullNameChange(event.target.value)}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="companyContactNationalCode">
          کد ملی رابط شرکت <span className="text-red-600">*</span>
        </label>
        <input
          id="companyContactNationalCode"
          type="tel"
          inputMode="numeric"
          dir="ltr"
          value={companyContactNationalCode}
          onChange={(event) => onCompanyContactNationalCodeChange(keepAsciiDigits(event.target.value).slice(0, 10))}
          placeholder="0012345678"
          maxLength={10}
          required
        />
      </div>

      {error ? <p className="field__hint">{error}</p> : null}
    </div>
  );
}
