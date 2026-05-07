export const applicationStatusLabels: Record<string, string> = {
  DRAFT: "پیش‌نویس",
  PENDING_PAYMENT: "در انتظار نتیجه پرداخت",
  SUBMITTED: "در صف بررسی",
  UNDER_REVIEW: "در حال بررسی",
  NEEDS_EDIT: "نیازمند اصلاح",
  VALIDATION_COMPLETED: "پایان فرآیند اعتبارسنجی",
};

export const applicationStatusVariants: Record<string, string> = {
  DRAFT: "muted",
  PENDING_PAYMENT: "warning",
  SUBMITTED: "info",
  UNDER_REVIEW: "review",
  NEEDS_EDIT: "attention",
  VALIDATION_COMPLETED: "success",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="status-badge" data-variant={applicationStatusVariants[status] || "muted"}>
      {applicationStatusLabels[status] || status}
    </span>
  );
}
