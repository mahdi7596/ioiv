const ZARINPAL_PRODUCTION_URL = "https://payment.zarinpal.com";
const ZARINPAL_SANDBOX_URL = "https://sandbox.zarinpal.com";

function getBaseUrl() {
  return process.env.ZARINPAL_SANDBOX === "true" ? ZARINPAL_SANDBOX_URL : ZARINPAL_PRODUCTION_URL;
}

function getMerchantId() {
  const merchantId = process.env.ZARINPAL_MERCHANT_ID;

  if (!merchantId) {
    throw new Error("ZARINPAL_MERCHANT_ID is required");
  }

  return merchantId;
}

async function postZarinpal<T>(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();

  if (!response.ok || payload.errors?.length) {
    throw new Error(`Zarinpal request failed: ${JSON.stringify(payload.errors || payload)}`);
  }

  return payload.data as T;
}

export async function requestZarinpalPayment(input: {
  amountToman: number;
  description: string;
  callbackUrl: string;
  mobile: string;
}): Promise<{ authority: string; paymentUrl: string }> {
  const data = await postZarinpal<{ authority: string }>("/pg/v4/payment/request.json", {
    merchant_id: getMerchantId(),
    amount: input.amountToman,
    currency: "IRT",
    description: input.description,
    callback_url: input.callbackUrl,
    metadata: {
      mobile: input.mobile,
    },
  });

  return {
    authority: data.authority,
    paymentUrl: `${getBaseUrl()}/pg/StartPay/${data.authority}`,
  };
}

export async function verifyZarinpalPayment(input: {
  amountToman: number;
  authority: string;
}): Promise<{ referenceId: string }> {
  const data = await postZarinpal<{ ref_id: number | string }>("/pg/v4/payment/verify.json", {
    merchant_id: getMerchantId(),
    amount: input.amountToman,
    currency: "IRT",
    authority: input.authority,
  });

  return { referenceId: String(data.ref_id) };
}
