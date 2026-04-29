const labels: Record<string, string> = {
  DRAFT: "پیش‌نویس",
  PENDING_PAYMENT: "در انتظار پرداخت",
  SUBMITTED: "ارسال شده",
  UNDER_REVIEW: "در حال بررسی",
  NEEDS_EDIT: "نیازمند ویرایش",
  REJECTED: "رد شده",
  ACCEPTED: "پذیرفته شده",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex rounded-md bg-stone-100 px-2 py-1 text-xs font-medium text-stone-800">
      {labels[status] || status}
    </span>
  );
}
