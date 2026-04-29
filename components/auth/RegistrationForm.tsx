"use client";

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
        inputMode="numeric"
        dir="ltr"
        value={companyNationalId}
        onChange={(event) => onCompanyNationalIdChange(event.target.value)}
        placeholder="12345678901"
      />
      {error ? <p className="field__hint">{error}</p> : null}
    </div>
  );
}
