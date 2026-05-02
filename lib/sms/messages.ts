import type { SmsMessage } from "./index";

const DEFAULT_OTP_TEMPLATE = "sanaotp";
const DEFAULT_STATUS_TEMPLATE = "sanastatus";
const DEFAULT_SUBMITTED_TEMPLATE = "sanasubmitted";
const DEFAULT_RECIPIENT_LABEL = "کاربر";

export function createOtpSmsMessage(to: string, code: string): SmsMessage {
  return {
    to,
    text: `سلام، کد ورود شما به سامانه اعتبارسنجی صندوق پژوهش و فناوری صنعت نفت (سانا) ${code}`,
    template: process.env.GHASEDAK_OTP_TEMPLATE || DEFAULT_OTP_TEMPLATE,
    params: { code },
  };
}

export function createStatusChangeSmsMessage(to: string): SmsMessage {
  return {
    to,
    text: `${DEFAULT_RECIPIENT_LABEL} گرامی، وضعیت پرونده شما در سامانه اعتبارسنجی صندوق پژوهش و فناوری صنعت نفت (سانا) تغییر کرد. برای مشاهده جزئیات وارد پنل شوید.`,
    template: process.env.GHASEDAK_STATUS_TEMPLATE || DEFAULT_STATUS_TEMPLATE,
    params: { recipient: DEFAULT_RECIPIENT_LABEL },
  };
}

export function createSubmissionReceivedSmsMessage(to: string): SmsMessage {
  return {
    to,
    text: `${DEFAULT_RECIPIENT_LABEL} گرامی، پرونده شما در سامانه اعتبارسنجی صندوق پژوهش و فناوری صنعت نفت (سانا) با موفقیت ثبت شد و در انتظار بررسی است.`,
    template: process.env.GHASEDAK_SUBMITTED_TEMPLATE || DEFAULT_SUBMITTED_TEMPLATE,
    params: { recipient: DEFAULT_RECIPIENT_LABEL },
  };
}

export function createAdminSubmissionSmsMessage(to: string, applicationId: string): SmsMessage {
  return {
    to,
    text: `پرونده جدید در سامانه اعتبارسنجی صندوق پژوهش و فناوری صنعت نفت (سانا) ثبت شد: ${applicationId}`,
  };
}
