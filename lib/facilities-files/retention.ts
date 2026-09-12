export const FACILITIES_UNAVAILABLE_RETENTION_MS = 24 * 60 * 60 * 1_000;

export function isFacilitiesUnavailableExpired(createdAt: Date, now = new Date()) {
  return now.getTime() - createdAt.getTime() >= FACILITIES_UNAVAILABLE_RETENTION_MS;
}

export function facilitiesUploadRecoveryMessage(status: string, expired = false) {
  if (expired) return "مهلت نگهداری فایل پایان یافته است؛ لطفاً فایل را دوباره بارگذاری کنید.";
  if (status === "UNAVAILABLE") return "بررسی امنیتی فایل موقتاً در دسترس نیست. فایل تا ۲۴ ساعت برای تلاش مجدد نگهداری می‌شود و هنوز قابل استفاده نیست.";
  if (["FAILED", "CORRUPT", "DISALLOWED", "OVERSIZED", "INTERRUPTED"].includes(status)) return "فایل رد شد و قابل استفاده نیست؛ لطفاً فایل معتبر دیگری بارگذاری کنید.";
  return "فایل هنوز قابل استفاده نیست؛ دوباره تلاش کنید.";
}

export function facilitiesUploadRecoveryState(status: string, expired = false) {
  if (expired) return "EXPIRED_REUPLOAD_REQUIRED" as const;
  if (status === "UNAVAILABLE") return "RETAINED_FOR_RETRY" as const;
  if (["FAILED", "CORRUPT", "DISALLOWED", "OVERSIZED", "INTERRUPTED"].includes(status)) return "PERMANENT_REJECTION" as const;
  return "TEMPORARY_OUTAGE" as const;
}
