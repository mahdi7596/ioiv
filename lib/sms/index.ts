export type SmsMessage = {
  to: string;
  text: string;
  template?: string;
  params?: Record<string, string>;
};

export async function sendSms(message: SmsMessage) {
  if (process.env.NODE_ENV !== "production") {
    console.log("[sms]", message);
    return { ok: true };
  }

  const { sendGhasedakSms } = await import("./ghasedak");
  return sendGhasedakSms(message);
}
