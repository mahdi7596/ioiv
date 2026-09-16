/** Error codes are deliberately safe to log or return to an API caller. */
export type FacilitiesFileErrorCode =
  | "FILE_EMPTY"
  | "FILE_TOO_LARGE"
  | "AGGREGATE_TOO_LARGE"
  | "UNSUPPORTED_FILENAME"
  | "CONTENT_TYPE_MISMATCH"
  | "CONTENT_CORRUPT"
  | "ZIP_UNSAFE"
  | "STORAGE_KEY_INVALID"
  | "STORAGE_CONFLICT"
  | "SCANNER_UNAVAILABLE";

const messages: Record<FacilitiesFileErrorCode, string> = {
  FILE_EMPTY: "فایل خالی است.",
  FILE_TOO_LARGE: "حجم فایل بیش از حد مجاز است.",
  AGGREGATE_TOO_LARGE: "مجموع حجم مدارک این درخواست بیش از حد مجاز است.",
  UNSUPPORTED_FILENAME: "نام یا نوع فایل پشتیبانی نمی‌شود.",
  CONTENT_TYPE_MISMATCH: "محتوای فایل با پسوند آن مطابقت ندارد.",
  CONTENT_CORRUPT: "فایل خراب است یا ساختار معتبری ندارد.",
  ZIP_UNSAFE: "فایل ZIP معتبر نیست؛ فقط فایل‌های PDF، تصویر و آفیس داخل ZIP مجاز است، محتوای هر فایل باید با پسوند آن مطابقت داشته باشد و فایل فشرده تودرتو پذیرفته نمی‌شود.",
  STORAGE_KEY_INVALID: "بارگذاری فایل ناموفق بود؛ دوباره تلاش کنید.",
  STORAGE_CONFLICT: "بارگذاری فایل ناموفق بود؛ دوباره تلاش کنید.",
  SCANNER_UNAVAILABLE: "بررسی امنیتی فایل موقتاً در دسترس نیست؛ کمی بعد دوباره تلاش کنید.",
};

/** User-facing Persian description of a verifier rejection. Never echoes file content. */
export function describeFacilitiesFileError(code: FacilitiesFileErrorCode): string {
  return messages[code];
}

export class FacilitiesFileError extends Error {
  constructor(
    public readonly code: FacilitiesFileErrorCode,
    message = code,
  ) {
    super(message);
    this.name = "FacilitiesFileError";
  }
}
