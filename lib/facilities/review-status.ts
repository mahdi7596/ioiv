import { ApplicationStatus } from "@prisma/client";

export const FACILITIES_REVIEW_VISIBLE_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.UNDER_REVIEW,
  ApplicationStatus.NEEDS_EDIT,
  ApplicationStatus.VALIDATION_COMPLETED,
];

export const FACILITIES_EDITABLE_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.DRAFT,
  ApplicationStatus.NEEDS_EDIT,
];

export function isFacilitiesApplicationEditable(status: ApplicationStatus | string) {
  return FACILITIES_EDITABLE_STATUSES.includes(status as ApplicationStatus);
}
