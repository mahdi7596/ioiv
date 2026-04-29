import type { SmsMessage } from "./index";

const DEFAULT_OTP_TEMPLATE = "sanaotp";
const DEFAULT_STATUS_TEMPLATE = "sanastatus";
const DEFAULT_SUBMITTED_TEMPLATE = "sanasubmitted";

export function createOtpSmsMessage(to: string, code: string): SmsMessage {
  return {
    to,
    text: `سلام، کد ورود شما به سامانه اعتبار سنجی نفت ایران (سانا) ${code}`,
    template: process.env.GHASEDAK_OTP_TEMPLATE || DEFAULT_OTP_TEMPLATE,
    params: { code },
  };
}

export function createStatusChangeSmsMessage(to: string): SmsMessage {
  return {
    to,
    text: "وضعیت پرونده شما در سامانه اعتبار سنجی نفت ایران (سانا) تغییر کرد، برای مشاهده جزئیات وارد پنل شوید.",
    template: process.env.GHASEDAK_STATUS_TEMPLATE || DEFAULT_STATUS_TEMPLATE,
  };
}

export function createSubmissionReceivedSmsMessage(to: string): SmsMessage {
  return {
    to,
    text: "پرونده شما در اعتبار سنجی نفت ایران (سانا) با موفقیت ثبت شد و در انتظار بررسی است.",
    template: process.env.GHASEDAK_SUBMITTED_TEMPLATE || DEFAULT_SUBMITTED_TEMPLATE,
  };
}

export function createAdminSubmissionSmsMessage(to: string, applicationId: string): SmsMessage {
  return {
    to,
    text: `پرونده جدید در سامانه اعتبار سنجی نفت ایران (سانا) ثبت شد: ${applicationId}`,
  };
}
