export const paymentStatusLabels: Record<string, string> = {
  INITIATED: "در انتظار نتیجه درگاه",
  REDIRECT_READY: "هدایت‌شده به درگاه",
  PENDING: "در انتظار تأیید درگاه",
  VERIFIED: "پرداخت موفق",
  FAILED: "پرداخت ناموفق",
  CANCELLED: "لغو شده",
  TIMED_OUT: "بدون پاسخ درگاه",
  NONE: "پرداخت انجام نشده",
};

const variants: Record<string, string> = {
  INITIATED: "warning",
  REDIRECT_READY: "warning",
  PENDING: "warning",
  VERIFIED: "success",
  FAILED: "danger",
  CANCELLED: "danger",
  TIMED_OUT: "warning",
  NONE: "muted",
};

/** Attempts that have not reached a terminal state; an old one needs attention. */
export const openPaymentStates = new Set(["INITIATED", "REDIRECT_READY", "PENDING", "TIMED_OUT"]);

export function PaymentStatusBadge({ status }: { status?: string | null }) {
  const value = status || "NONE";

  return (
    <span className="status-badge" data-variant={variants[value] || "muted"}>
      {paymentStatusLabels[value] || value}
    </span>
  );
}
