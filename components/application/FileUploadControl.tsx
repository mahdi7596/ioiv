"use client";

import type { FileRef } from "./types";

type FileUploadControlProps = {
  id: string;
  label: string;
  required?: boolean;
  value?: FileRef;
  uploading?: boolean;
  progress?: number;
  error?: string;
  onUpload: (file: File) => void;
};

export function FileUploadControl({
  id,
  label,
  required,
  value,
  uploading,
  progress,
  error,
  onUpload,
}: FileUploadControlProps) {
  return (
    <div className="upload-control" data-invalid={error ? "true" : undefined}>
      <label className="font-bold" htmlFor={id}>
        {label} {required ? <span className="text-red-600">*</span> : null}
      </label>
      <p className="field__hint">فرمت مجاز: PDF، Word یا ZIP. حداکثر حجم ۲۰ مگابایت.</p>
      <div className="upload-picker">
        <input
          id={id}
          type="file"
          accept=".pdf,.doc,.docx,.zip"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              onUpload(file);
              event.currentTarget.value = "";
            }
          }}
          className="upload-picker__input"
        />
        <label className="button button--ghost upload-picker__button" htmlFor={id}>
          {value ? "تغییر فایل" : "انتخاب فایل"}
        </label>
        <span className={value ? "upload-picker__name" : "upload-picker__placeholder"}>
          {value ? value.name : "هنوز فایلی ثبت نشده است"}
        </span>
      </div>
      {uploading ? (
        <>
          <div className="progress-bar" aria-label="پیشرفت بارگذاری">
            <span style={{ width: `${progress ?? 0}%` }} />
          </div>
          <p className="field__hint">در حال بارگذاری... {progress ?? 0}%</p>
        </>
      ) : null}
      {value ? <p className="upload-control__success">فایل با موفقیت ثبت شد.</p> : null}
      {error ? <p className="field__hint">{error}</p> : null}
      {error ? (
        <label className="button button--ghost" htmlFor={id}>
          تلاش دوباره
        </label>
      ) : null}
    </div>
  );
}
