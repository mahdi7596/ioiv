import { logger, maskMobile } from "@/lib/logger";

export type SmsMessage = {
  to: string;
  text: string;
  template?: string;
  params?: Record<string, string>;
  clientReferenceId?: string;
};

export async function sendSms(message: SmsMessage) {
  if (process.env.NODE_ENV !== "production" && process.env.SMS_SEND_IN_DEVELOPMENT !== "true") {
    logger.info("sms_dev_message", {
      to: maskMobile(message.to),
      template: message.template,
      text: message.text,
      params: message.params,
    });
    return { ok: true };
  }

  const { sendGhasedakSms } = await import("./ghasedak");
  logger.info("sms_send_started", {
    to: maskMobile(message.to),
    template: message.template,
  });

  try {
    const result = await sendGhasedakSms(message);
    logger.info("sms_send_succeeded", {
      to: maskMobile(message.to),
      template: message.template,
    });
    return result;
  } catch (error) {
    logger.error("sms_send_failed", error, {
      to: maskMobile(message.to),
      template: message.template,
    });
    throw error;
  }
}
