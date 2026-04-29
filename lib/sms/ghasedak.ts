import type { SmsMessage } from "./index";

const GHASEDAK_BASE_URL = "https://api.ghasedak.me/v2";

async function postToGhasedak(path: string, body: Record<string, unknown>) {
  const apiKey = process.env.GHASEDAK_API_KEY;

  if (!apiKey) {
    throw new Error("GHASEDAK_API_KEY is required in production");
  }

  const response = await fetch(`${GHASEDAK_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ghasedak SMS request failed: ${response.status} ${text}`);
  }

  return response.json();
}

export async function sendGhasedakSms(message: SmsMessage) {
  if (message.template) {
    return postToGhasedak("/verification/send/simple", {
      receptor: message.to,
      template: message.template,
      type: 1,
      param1: message.params?.code,
    });
  }

  return postToGhasedak("/sms/send/simple", {
    receptor: message.to,
    message: message.text,
    linenumber: process.env.GHASEDAK_SENDER || undefined,
  });
}
