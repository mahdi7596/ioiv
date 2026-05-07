import { ApplicationStatus } from "@prisma/client";

const EDITABLE_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.DRAFT,
  ApplicationStatus.NEEDS_EDIT,
];

export function canEditApplication(status: ApplicationStatus) {
  return EDITABLE_STATUSES.includes(status);
}

export function getApplicationAccess(status: ApplicationStatus) {
  return {
    canView: true,
    canEdit: canEditApplication(status),
    canRetryPayment: status === ApplicationStatus.PENDING_PAYMENT,
  };
}
