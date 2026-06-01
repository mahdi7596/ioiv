const ZARINPAL_PRODUCTION_URL = "https://payment.zarinpal.com";
const ZARINPAL_SANDBOX_URL = "https://sandbox.zarinpal.com";
const ZARINPAL_MERCHANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZARINPAL_NETWORK_RETRY_DELAYS_MS = [300, 900];

function getBaseUrl() {
  return process.env.ZARINPAL_SANDBOX === "true" ? ZARINPAL_SANDBOX_URL : ZARINPAL_PRODUCTION_URL;
}

function getMerchantId() {
  const merchantId = process.env.ZARINPAL_MERCHANT_ID?.trim();

  if (!merchantId) {
    throw new Error("ZARINPAL_MERCHANT_ID is required");
  }

  if (!ZARINPAL_MERCHANT_ID_PATTERN.test(merchantId)) {
    throw new Error("ZARINPAL_MERCHANT_ID must be a valid UUID");
  }

  return merchantId;
}

async function postZarinpal<T>(path: string, body: Record<string, unknown>) {
  const response = await fetchWithNetworkRetry(`${getBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();

  if (!response.ok || hasZarinpalErrors(payload.errors)) {
    throw new Error(`Zarinpal request failed: ${JSON.stringify(sanitizeZarinpalError(payload.errors || payload))}`);
  }

  return payload.data as T;
}

async function fetchWithNetworkRetry(input: string, init: RequestInit) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= ZARINPAL_NETWORK_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;

      if (!isTransientFetchError(error) || attempt === ZARINPAL_NETWORK_RETRY_DELAYS_MS.length) {
        throw error;
      }

      await wait(ZARINPAL_NETWORK_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError;
}

function isTransientFetchError(error: unknown) {
  return error instanceof TypeError && error.message === "fetch failed";
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeZarinpalError(errorPayload: unknown): unknown {
  if (Array.isArray(errorPayload)) {
    return errorPayload.map(sanitizeZarinpalError);
  }

  if (errorPayload && typeof errorPayload === "object") {
    const source = errorPayload as Record<string, unknown>;

    return {
      code: source.code,
      message: source.message,
      validations: source.validations,
    };
  }

  return errorPayload;
}

function hasZarinpalErrors(errors: unknown) {
  if (!errors) {
    return false;
  }

  if (Array.isArray(errors)) {
    return errors.length > 0;
  }

  if (typeof errors === "object") {
    return Object.keys(errors).length > 0;
  }

  return Boolean(errors);
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
