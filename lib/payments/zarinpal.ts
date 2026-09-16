import { ZarinpalRejectedError, ZarinpalUnavailableError } from "@/lib/payments/zarinpal-errors";

const ZARINPAL_PRODUCTION_URL = "https://payment.zarinpal.com";
const ZARINPAL_SANDBOX_URL = "https://sandbox.zarinpal.com";
const ZARINPAL_MERCHANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZARINPAL_NETWORK_RETRY_DELAYS_MS = [300, 900];
const ZARINPAL_DEFAULT_TIMEOUT_MS = 10_000;
const ZARINPAL_MAX_TIMEOUT_RETRIES = 1;

function requestTimeoutMs() {
  const configured = Number(process.env.ZARINPAL_REQUEST_TIMEOUT_MS || ZARINPAL_DEFAULT_TIMEOUT_MS);
  return Number.isFinite(configured) ? Math.min(30_000, Math.max(1_000, configured)) : ZARINPAL_DEFAULT_TIMEOUT_MS;
}

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

/**
 * Distinguishes an explicit gateway rejection (safe to act on) from an answer
 * that cannot be trusted (5xx, non-JSON body, non-2xx without a gateway error
 * payload). See `zarinpal-errors.ts` for why the two must never be conflated.
 */
async function postZarinpal(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetchWithNetworkRetry(`${getBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const status = typeof response.status === "number" ? response.status : undefined;
  if (status !== undefined && status >= 500) {
    throw new ZarinpalUnavailableError("HTTP_5XX", status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ZarinpalUnavailableError("MALFORMED_RESPONSE", status);
  }
  if (!payload || typeof payload !== "object") {
    throw new ZarinpalUnavailableError("MALFORMED_RESPONSE", status);
  }

  const { data, errors } = payload as { data?: unknown; errors?: unknown };
  if (hasZarinpalErrors(errors)) {
    const code = errors && typeof errors === "object" && !Array.isArray(errors) && typeof (errors as { code?: unknown }).code === "number"
      ? (errors as { code: number }).code
      : undefined;
    throw new ZarinpalRejectedError(code, sanitizeZarinpalError(errors));
  }
  if (!response.ok) {
    throw new ZarinpalUnavailableError("HTTP_ERROR", status);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ZarinpalUnavailableError("MALFORMED_RESPONSE", status);
  }

  return data as Record<string, unknown>;
}

async function fetchWithNetworkRetry(input: string, init: RequestInit) {
  let lastError: unknown;
  let timeoutRetries = 0;

  for (let attempt = 0; attempt <= ZARINPAL_NETWORK_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      // A fresh signal per attempt: an aborted signal would abort every retry.
      return await fetch(input, { ...init, signal: AbortSignal.timeout(requestTimeoutMs()) });
    } catch (error) {
      lastError = error;

      const timedOut = isTimeoutError(error);
      if (timedOut) timeoutRetries += 1;
      if (
        (!timedOut && !isTransientFetchError(error)) ||
        attempt === ZARINPAL_NETWORK_RETRY_DELAYS_MS.length ||
        timeoutRetries > ZARINPAL_MAX_TIMEOUT_RETRIES
      ) {
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

function isTimeoutError(error: unknown) {
  return error instanceof Error && error.name === "TimeoutError";
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
  const data = await postZarinpal("/pg/v4/payment/request.json", {
    merchant_id: getMerchantId(),
    amount: input.amountToman,
    currency: "IRT",
    description: input.description,
    callback_url: input.callbackUrl,
    metadata: {
      mobile: input.mobile,
    },
  });
  const authority = data.authority;
  if (typeof authority !== "string" || !authority) {
    throw new ZarinpalUnavailableError("MALFORMED_RESPONSE");
  }

  return {
    authority,
    paymentUrl: `${getBaseUrl()}/pg/StartPay/${authority}`,
  };
}

export async function verifyZarinpalPayment(input: {
  amountToman: number;
  authority: string;
}): Promise<{ referenceId: string }> {
  const data = await postZarinpal("/pg/v4/payment/verify.json", {
    merchant_id: getMerchantId(),
    amount: input.amountToman,
    currency: "IRT",
    authority: input.authority,
  });
  // code 100 = verified now, 101 = already verified earlier; both confirm capture.
  const referenceId = data.ref_id;
  if ((typeof referenceId !== "string" && typeof referenceId !== "number") || referenceId === "") {
    throw new ZarinpalUnavailableError("MALFORMED_RESPONSE");
  }

  return { referenceId: String(referenceId) };
}
