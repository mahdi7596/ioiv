export const applicationStatuses = [
  "DRAFT",
  "PENDING_PAYMENT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "NEEDS_EDIT",
  "VALIDATION_COMPLETED",
] as const;

export type ApplicationStatusValue = (typeof applicationStatuses)[number];

export const allowedApplicationStatusTransitions: Partial<
  Record<ApplicationStatusValue, ApplicationStatusValue[]>
> = {
  SUBMITTED: ["UNDER_REVIEW", "NEEDS_EDIT", "VALIDATION_COMPLETED"],
  UNDER_REVIEW: ["NEEDS_EDIT", "VALIDATION_COMPLETED"],
  NEEDS_EDIT: ["UNDER_REVIEW"],
};

export function getAllowedNextApplicationStatuses(status: string) {
  return allowedApplicationStatusTransitions[status as ApplicationStatusValue] || [];
}
