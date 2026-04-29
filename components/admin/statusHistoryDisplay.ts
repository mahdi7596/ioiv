import { applicationStatusLabels, applicationStatusVariants } from "./StatusBadge";

const legacyHistoryNoteLabels: Record<string, string> = {
  "Manual test payment marked verified.": "پرداخت تستی به صورت دستی تایید شد.",
};

export type StatusHistoryDisplayInput = {
  previousStatus?: string | null;
  newStatus: string;
  note?: string | null;
};

export function getStatusHistoryDisplay({ previousStatus, newStatus, note }: StatusHistoryDisplayInput) {
  return {
    previous: previousStatus
      ? {
          label: applicationStatusLabels[previousStatus] || previousStatus,
          variant: applicationStatusVariants[previousStatus] || "muted",
        }
      : null,
    next: {
      label: applicationStatusLabels[newStatus] || newStatus,
      variant: applicationStatusVariants[newStatus] || "muted",
    },
    note: note ? legacyHistoryNoteLabels[note] || note : null,
  };
}
