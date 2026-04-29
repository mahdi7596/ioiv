export const paymentStatusLabels: Record<string, string> = {
  INITIATED: "در انتظار نتیجه درگاه",
  VERIFIED: "پرداخت موفق",
  FAILED: "پرداخت ناموفق",
  NONE: "پرداخت انجام نشده",
};

const variants: Record<string, string> = {
  INITIATED: "warning",
  VERIFIED: "success",
  FAILED: "danger",
  NONE: "muted",
};

export function PaymentStatusBadge({ status }: { status?: string | null }) {
  const value = status || "NONE";

  return (
    <span className="status-badge" data-variant={variants[value] || "muted"}>
      {paymentStatusLabels[value] || value}
    </span>
  );
}
