import type { SmsMessage } from "./index";

const DEFAULT_MELIPAYAMAK_API_URL = "https://rest.payamak-panel.com/api/SendSMS";

const ERRORS: Record<string, string> = {
  "-111": "IP درخواست کننده نامعتبر است.",
  "-110": "الزام استفاده از ApiKey به جای رمز عبور",
  "-109": "الزام تنظیم IP مجاز برای استفاده از API",
  "-108": "مسدود شدن IP به دلیل تلاش ناموفق استفاده از API",
  "-10": "در میان متغیرهای ارسالی، لینک وجود دارد.",
  "-7": "خطایی در شماره فرستنده رخ داده است.",
  "-6": "خطای داخلی رخ داده است.",
  "-5": "متن ارسالی با متغیرهای متن پیشفرض همخوانی ندارد.",
  "-4": "کد متن ارسالی صحیح نمی‌باشد.",
  "-3": "خط ارسالی در سیستم تعریف نشده است.",
  "-2": "محدودیت تعداد شماره.",
  "-1": "دسترسی غیرفعال است.",
  "0": "نام کاربری یا رمزعبور صحیح نمی‌باشد.",
  "2": "اعتبار کافی نمی‌باشد.",
  "6": "سامانه در حال بروزرسانی می‌باشد.",
  "7": "متن حاوی کلمه فیلتر شده.",
  "10": "کاربر موردنظر فعال نمی‌باشد.",
  "11": "ارسال نشده",
  "12": "مدارک کاربر کامل نمی‌باشد.",
  "16": "شماره گیرنده‌ای یافت نشد.",
  "17": "متن پیامک خالی می‌باشد.",
  "18": "شماره گیرنده نامعتبر است.",
  "19": "از محدودیت ساعتی فراتر رفته‌اید.",
  "35": "شماره موبایل گیرنده در لیست سیاه مخابرات است.",
};

function parseResult(responseText: string): string {
  const trimmed = responseText.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "string" || typeof parsed === "number") return String(parsed).trim();
    if (parsed && typeof parsed === "object" && "Value" in parsed) {
      return String((parsed as { Value: unknown }).Value).trim();
    }
  } catch {
    // non-JSON scalar expected from Melipayamak
  }
  return trimmed;
}

function isSuccessResult(result: string): boolean {
  return /^\d{16,}$/.test(result);
}

async function postToMelipayamak(path: string, body: Record<string, string>): Promise<void> {
  const username = process.env.MELIPAYAMAK_USERNAME;
  const password = process.env.MELIPAYAMAK_PASSWORD;
  const baseUrl = process.env.MELIPAYAMAK_API_URL || DEFAULT_MELIPAYAMAK_API_URL;

  if (!username || !password) {
    throw new Error("MELIPAYAMAK_USERNAME and MELIPAYAMAK_PASSWORD are required");
  }

  const payload = new URLSearchParams({ username, password, ...body });
  const response = await fetch(`${baseUrl}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload.toString(),
  });

  const responseText = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`Melipayamak request failed: ${response.status} ${responseText}`);
  }

  const result = parseResult(responseText);
  if (!isSuccessResult(result)) {
    const errMsg = ERRORS[result] || result || "empty gateway response";
    throw new Error(`Melipayamak SMS failed: ${errMsg}`);
  }
}

export async function sendMelipayamakSms(message: SmsMessage): Promise<void> {
  if (message.template) {
    // Template/pattern SMS — params.code is the variable for OTP; other templates pass empty.
    const variable =
      message.params?.code ?? (message.params ? Object.values(message.params)[0] : undefined) ?? "";
    return postToMelipayamak("BaseServiceNumber", {
      to: message.to,
      text: variable,
      bodyId: message.template,
    });
  }

  // Plain text SMS
  const from = process.env.MELIPAYAMAK_FROM ?? "";
  return postToMelipayamak("SendSMS", {
    to: message.to,
    from,
    text: message.text,
  });
}
