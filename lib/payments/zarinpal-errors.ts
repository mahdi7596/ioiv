/**
 * Zarinpal outcomes fall into two classes that callers must treat differently.
 *
 * - Rejected: the gateway answered and explicitly refused (validation error,
 *   unpaid or expired session, amount mismatch, unknown authority). For a verify
 *   call this is an authoritative "no money moved for this authority", so the
 *   attempt may be closed.
 * - Unavailable: there is no trustworthy answer (network failure, timeout,
 *   HTTP 5xx, malformed body, missing fields). A payment may still have been
 *   captured, so the attempt must stay open and be re-verified later; it must
 *   never be marked failed on this evidence alone.
 *
 * Network and timeout errors are rethrown as-is by the client so retry logic and
 * logging keep the original error; `isZarinpalRejection` is the only test callers
 * need: anything that is not a rejection is "unknown, keep the attempt open".
 */
export class ZarinpalRejectedError extends Error {
  readonly name = "ZarinpalRejectedError";

  constructor(
    readonly code: number | undefined,
    detail: unknown,
  ) {
    super(`Zarinpal request failed: ${JSON.stringify(detail)}`);
  }
}

export type ZarinpalUnavailableReason = "HTTP_5XX" | "HTTP_ERROR" | "MALFORMED_RESPONSE";

export class ZarinpalUnavailableError extends Error {
  readonly name = "ZarinpalUnavailableError";

  constructor(
    readonly reason: ZarinpalUnavailableReason,
    readonly httpStatus?: number,
  ) {
    super(`Zarinpal unavailable: ${reason}${httpStatus ? ` (HTTP ${httpStatus})` : ""}`);
  }
}

export function isZarinpalRejection(error: unknown): error is ZarinpalRejectedError {
  return error instanceof ZarinpalRejectedError;
}
