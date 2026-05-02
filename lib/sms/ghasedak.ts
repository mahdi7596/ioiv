import type { SmsMessage } from "./index";

const DEFAULT_GHASEDAK_BASE_URL = "http://api.smsapp.ir/v2";

type GhasedakResponse = {
  IsSuccess?: boolean;
  StatusCode?: number;
  Message?: string;
  result?: string;
  message?: string;
  messageids?: number | string;
};

async function postToGhasedak(path: string, body: Record<string, unknown>) {
  const apiKey = process.env.GHASEDAK_API_KEY;
  const baseUrl = process.env.GHASEDAK_BASE_URL || DEFAULT_GHASEDAK_BASE_URL;

  if (!apiKey) {
    throw new Error("GHASEDAK_API_KEY is required in production");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      apikey: apiKey,
    },
    body: new URLSearchParams(
      Object.entries(body).reduce<Record<string, string>>((params, [key, value]) => {
        if (value === undefined) {
          return params;
        }

        params[key] = value === null ? "" : String(value);
        return params;
      }, {}),
    ).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ghasedak SMS request failed: ${response.status} ${text}`);
  }

  const result = (await response.json()) as GhasedakResponse;

  if (result.IsSuccess === false || result.result === "error") {
    throw new Error(
      `Ghasedak SMS request failed: ${result.StatusCode || "unknown"} ${result.Message || result.message || ""}`.trim(),
    );
  }

  return result;
}

function paramsToTemplateFields(params: SmsMessage["params"]) {
  if (!params) {
    return {};
  }

  const values = params.code
    ? [params.code]
    : Object.keys(params)
        .sort()
        .map((key) => params[key])
        .filter(Boolean);

  return values.slice(0, 10).reduce<Record<string, string>>((fields, value, index) => {
    fields[`param${index + 1}`] = value;
    return fields;
  }, {});
}

export async function sendGhasedakSms(message: SmsMessage) {
  if (message.template) {
    return postToGhasedak("/send/verify", {
      type: 1,
      receptor: message.to,
      template: message.template,
      param1: "",
      ...paramsToTemplateFields(message.params),
      checkingids: message.clientReferenceId,
    });
  }

  return postToGhasedak("/sms/send/simple", {
    receptor: message.to,
    message: message.text,
    sender: process.env.GHASEDAK_SENDER || undefined,
    checkingids: message.clientReferenceId,
  });
}
