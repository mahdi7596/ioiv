/**
 * Rejected means the provider returned an error envelope; it is not proof that
 * an issued authority can never be paid. R2 keeps the selected obligation and
 * permits only a sequential check of that same authority after a completed
 * rejection. Unknown transport outcomes never authorize remote replay.
 * Finality and envelope validation are separate provider qualification work.
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
