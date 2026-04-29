"use client";

type YearSelectProps = {
  id: string;
  value?: string;
  required?: boolean;
  onChange: (year: string) => void;
};

const years = ["1404", "1403", "1402", "1401", "1400", "1399", "1398"];

export function YearSelect({ id, value, required, onChange }: YearSelectProps) {
  return (
    <div className="field">
      <label htmlFor={id}>
        سال {required ? <span aria-hidden="true">*</span> : null}
      </label>
      <select id={id} dir="ltr" value={value ?? ""} required={required} onChange={(event) => onChange(event.target.value)}>
        <option value="">انتخاب سال</option>
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  );
}
