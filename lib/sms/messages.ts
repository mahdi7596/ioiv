import type { SmsMessage } from "./index";

const DEFAULT_RECIPIENT_LABEL = "کاربر";
const SERVICE_NAME = "سامانه اعتبار سنجی سانا";

export function createOtpSmsMessage(to: string, code: string): SmsMessage {
  return {
    to,
    text: `سلام، کد ورود شما به ${SERVICE_NAME} ${code}`,
    template: process.env.MELIPAYAMAK_OTP_BODY_ID,
    params: { code },
  };
}

export function createStatusChangeSmsMessage(to: string): SmsMessage {
  return {
    to,
    text: `${DEFAULT_RECIPIENT_LABEL} گرامی، وضعیت پرونده شما در ${SERVICE_NAME} تغییر کرد. برای مشاهده جزئیات وارد پنل شوید.`,
    template: process.env.MELIPAYAMAK_STATUS_BODY_ID,
    params: { recipient: DEFAULT_RECIPIENT_LABEL },
  };
}

export function createSubmissionReceivedSmsMessage(to: string): SmsMessage {
  return {
    to,
    text: `${DEFAULT_RECIPIENT_LABEL} گرامی، پرونده شما در ${SERVICE_NAME} با موفقیت ثبت شد و در انتظار بررسی است.`,
    template: process.env.MELIPAYAMAK_SUBMITTED_BODY_ID,
    params: { recipient: DEFAULT_RECIPIENT_LABEL },
  };
}

export function createAdminSubmissionSmsMessage(to: string, applicationId: string): SmsMessage {
  return {
    to,
    text: `پرونده جدید در ${SERVICE_NAME} ثبت شد: ${applicationId}`,
  };
}

export function createKalanHesabUserSmsMessage(to: string, fullName: string): SmsMessage {
  return {
    to,
    text: `فرهیخته گرامی، ${fullName} ضمن تشکر از اعتماد شما، متخصصان ما در اولین فرصت با شما تماس خواهند گرفت.`,
    template: process.env.MELIPAYAMAK_KALAN_HESAB_USER_BODY_ID,
    params: { name: fullName },
  };
}

export function createKalanHesabAdminSmsMessage(to: string, fullName: string): SmsMessage {
  return {
    to,
    text: `${fullName} فرم جدید ارسال نمود.`,
    template: process.env.MELIPAYAMAK_KALAN_HESAB_ADMIN_BODY_ID,
    params: { name: fullName },
  };
}
