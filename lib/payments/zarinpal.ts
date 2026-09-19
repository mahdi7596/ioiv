import { ZarinpalRejectedError, ZarinpalUnavailableError } from "@/lib/payments/zarinpal-errors";

const ZARINPAL_PRODUCTION_URL = "https://payment.zarinpal.com";
const ZARINPAL_SANDBOX_URL = "https://sandbox.zarinpal.com";
const ZARINPAL_MERCHANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZARINPAL_DEFAULT_TIMEOUT_MS = 10_000;

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
  const response = await fetch(`${getBaseUrl()}${path}`, {
    signal: AbortSignal.timeout(requestTimeoutMs()),
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
  if (!isRecord(payload)) throw new ZarinpalUnavailableError("MALFORMED_RESPONSE", status);
  const { data, errors } = payload;
  // A rejection must be explicit and noncontradictory. Never reinterpret a
  // malformed success/error mixture as permission to replay provider I/O.
  const emptyData = (Array.isArray(data) && data.length === 0) || (isRecord(data) && Object.keys(data).length === 0);
  const code = isRecord(errors) ? errors.code : undefined;
  const rejectionCodes = path.endsWith("/request.json")
    ? [-9, -10, -11, -12, -13, -14, -15, -16, -17, -18, -19, -40, -41]
    : [-9, -10, -11, -12, -13, -14, -15, -16, -17, -18, -19, -50, -51, -52, -53, -54, -55];
  if (emptyData && typeof code === "number" && rejectionCodes.includes(code)) {
    // Provider-controlled messages/validations may echo credentials or card data.
    throw new ZarinpalRejectedError(code, { code });
  }
  if (!response.ok) throw new ZarinpalUnavailableError("HTTP_ERROR", status);
  if (!isRecord(data) || !Array.isArray(errors) || errors.length !== 0) {
    throw new ZarinpalUnavailableError("MALFORMED_RESPONSE", status);
  }
  // These echoes are optional (absent in official examples), but cannot disagree.
  for (const key of ["authority", "amount", "currency"] as const) {
    if (key in body && key in data && data[key] !== body[key]) {
      throw new ZarinpalUnavailableError("MALFORMED_RESPONSE", status);
    }
  }
  return data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validAuthority(value: unknown): value is string {
  const pattern = process.env.ZARINPAL_SANDBOX === "true" ? /^S[A-Za-z0-9]{35}$/ : /^A[A-Za-z0-9]{35}$/;
  return typeof value === "string" && pattern.test(value);
}

function validAmount(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new ZarinpalUnavailableError("MALFORMED_RESPONSE");
}

export async function requestZarinpalPayment(input: {
  amountToman: number;
  description: string;
  callbackUrl: string;
  mobile: string;
}): Promise<{ authority: string; paymentUrl: string }> {
  validAmount(input.amountToman);
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
  if (data.code !== 100 || !validAuthority(authority)) {
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
  validAmount(input.amountToman);
  if (!validAuthority(input.authority)) throw new ZarinpalUnavailableError("MALFORMED_RESPONSE");
  const data = await postZarinpal("/pg/v4/payment/verify.json", {
    merchant_id: getMerchantId(),
    amount: input.amountToman,
    currency: "IRT",
    authority: input.authority,
  });
  // code 100 = verified now, 101 = already verified earlier; both confirm capture.
  const referenceId = data.ref_id;
  if ((data.code !== 100 && data.code !== 101) || typeof referenceId !== "number" || !Number.isSafeInteger(referenceId) || referenceId <= 0) {
    throw new ZarinpalUnavailableError("MALFORMED_RESPONSE");
  }

  return { referenceId: String(referenceId) };
}
