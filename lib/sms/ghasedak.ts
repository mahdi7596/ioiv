import type { SmsMessage } from "./index";

const GHASEDAK_BASE_URL = "https://gateway.ghasedak.me/rest/api/v1/WebService";

type GhasedakResponse = {
  IsSuccess?: boolean;
  StatusCode?: number;
  Message?: string;
};

async function postToGhasedak(path: string, body: Record<string, unknown>) {
  const apiKey = process.env.GHASEDAK_API_KEY;

  if (!apiKey) {
    throw new Error("GHASEDAK_API_KEY is required in production");
  }

  const response = await fetch(`${GHASEDAK_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ApiKey: apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ghasedak SMS request failed: ${response.status} ${text}`);
  }

  const result = (await response.json()) as GhasedakResponse;

  if (result.IsSuccess === false) {
    throw new Error(`Ghasedak SMS request failed: ${result.StatusCode || "unknown"} ${result.Message || ""}`.trim());
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

function hasParams(params: SmsMessage["params"]) {
  return Boolean(params && Object.values(params).some(Boolean));
}

export async function sendGhasedakSms(message: SmsMessage) {
  if (message.template) {
    if (hasParams(message.params)) {
      return postToGhasedak("/SendOtpWithParams", {
        receptors: [{ mobile: message.to, clientReferenceId: message.clientReferenceId }],
        templateName: message.template,
        ...paramsToTemplateFields(message.params),
        isVoice: false,
        udh: false,
      });
    }

    return postToGhasedak("/SendOtpSMS", {
      receptors: [{ mobile: message.to, clientReferenceId: message.clientReferenceId }],
      templateName: message.template,
      inputs: [],
      udh: false,
    });
  }

  return postToGhasedak("/SendSingleSMS", {
    receptor: message.to,
    message: message.text,
    lineNumber: process.env.GHASEDAK_SENDER || undefined,
    clientReferenceId: message.clientReferenceId,
    udh: false,
  });
}
