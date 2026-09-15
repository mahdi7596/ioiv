export type FacilitiesPaymentNotice = "success" | "failed" | "pending" | "paid-unsubmitted";

const OPEN_PAYMENT_STATES = new Set(["INITIATED", "REDIRECT_READY", "PENDING", "TIMED_OUT"]);
const SUBMITTED_OR_LATER = new Set(["SUBMITTED", "UNDER_REVIEW", "NEEDS_EDIT", "VALIDATION_COMPLETED"]);

type NoticeApplication = { status: string; payments: Array<{ status: string }> } | null | undefined;

/**
 * Turns the `?payment=` hint from the gateway callback into a banner that is
 * backed by database state, so a forged query string cannot claim success.
 * A verified payment on an application that never reached SUBMITTED wins over
 * every hint: the user must press submit again and is told no fee is charged.
 */
export function deriveFacilitiesPaymentNotice(param: string | undefined, application: NoticeApplication): FacilitiesPaymentNotice | undefined {
  if (!application) return param === "failed" ? "failed" : undefined;

  const statuses = application.payments.map((payment) => payment.status);
  const hasVerified = statuses.includes("VERIFIED");
  const submittedOrLater = SUBMITTED_OR_LATER.has(application.status);

  if (hasVerified && !submittedOrLater) return "paid-unsubmitted";
  if (param === "failed") return "failed";
  if (param === "success") return hasVerified && submittedOrLater ? "success" : undefined;
  if (param === "pending") return statuses.some((status) => OPEN_PAYMENT_STATES.has(status)) ? "pending" : undefined;
  return undefined;
}
