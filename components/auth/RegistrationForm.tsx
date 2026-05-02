"use client";

import { keepAsciiDigits } from "@/lib/input/digits";

type RegistrationFormProps = {
  companyName: string;
  companyNationalId: string;
  companyContactNationalId: string;
  companyContactFullName: string;
  companyContactNationalCode: string;
  error?: string;
  onCompanyNameChange: (value: string) => void;
  onCompanyNationalIdChange: (value: string) => void;
  onCompanyContactNationalIdChange: (value: string) => void;
  onCompanyContactFullNameChange: (value: string) => void;
  onCompanyContactNationalCodeChange: (value: string) => void;
};

export function RegistrationForm({
  companyName,
  companyNationalId,
  companyContactNationalId,
  companyContactFullName,
  companyContactNationalCode,
  error,
  onCompanyNameChange,
  onCompanyNationalIdChange,
  onCompanyContactNationalIdChange,
  onCompanyContactFullNameChange,
  onCompanyContactNationalCodeChange,
}: RegistrationFormProps) {
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

      <div className="field">
        <label htmlFor="companyNationalId">
          شناسه ملی شرکت <span className="text-red-600">*</span>
        </label>
        <input
          id="companyNationalId"
          type="tel"
          inputMode="numeric"
          dir="ltr"
          value={companyNationalId}
          onChange={(event) => onCompanyNationalIdChange(keepAsciiDigits(event.target.value).slice(0, 11))}
          placeholder="12345678901"
          maxLength={11}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="companyContactNationalId">
          شناسه ملی رابط شرکت <span className="text-red-600">*</span>
        </label>
        <input
          id="companyContactNationalId"
          type="tel"
          inputMode="numeric"
          dir="ltr"
          value={companyContactNationalId}
          onChange={(event) => onCompanyContactNationalIdChange(keepAsciiDigits(event.target.value).slice(0, 11))}
          placeholder="12345678901"
          maxLength={11}
          required
        />
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
