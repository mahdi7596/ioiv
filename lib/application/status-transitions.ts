export const applicationStatuses = [
  "DRAFT",
  "PENDING_PAYMENT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "NEEDS_EDIT",
  "REJECTED",
  "ACCEPTED",
] as const;

export type ApplicationStatusValue = (typeof applicationStatuses)[number];

export const allowedApplicationStatusTransitions: Partial<
  Record<ApplicationStatusValue, ApplicationStatusValue[]>
> = {
  SUBMITTED: ["UNDER_REVIEW", "NEEDS_EDIT", "ACCEPTED", "REJECTED"],
  UNDER_REVIEW: ["NEEDS_EDIT", "ACCEPTED", "REJECTED"],
  NEEDS_EDIT: ["UNDER_REVIEW"],
};

export function getAllowedNextApplicationStatuses(status: string) {
  return allowedApplicationStatusTransitions[status as ApplicationStatusValue] || [];
}
