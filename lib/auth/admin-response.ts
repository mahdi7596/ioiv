import { setTimeout as delay } from "node:timers/promises";
import { smsRequestTimeoutMs } from "@/lib/sms/timeout";

export const ADMIN_REQUEST_MESSAGE = "اگر این شماره مجاز باشد، کد تأیید برای آن ارسال می‌شود. در صورت دریافت پیامک، کد را وارد کنید؛ برای درخواست دوباره ۹۰ ثانیه صبر کنید.";

// Admission precedes this bounded wait. Cover normal lookup, hashing, claim and
// awaited SMS timing without detached dispatch or holding a database transaction.
// This is a minimum duration, not a guarantee under event-loop/DB network stalls.
export function adminResponseDeadline() {
  return performance.now() + smsRequestTimeoutMs() + 12000;
}

export async function waitForAdminResponse(deadline: number) {
  await delay(Math.max(0, deadline - performance.now()));
}
