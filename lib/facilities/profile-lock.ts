import { ApplicationStatus, type Prisma } from "@prisma/client";

import { ActionError } from "@/lib/actions/auth";
import { db } from "@/lib/db";

export const PROFILE_LOCK_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.PENDING_PAYMENT,
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.UNDER_REVIEW,
  ApplicationStatus.NEEDS_EDIT,
];

// Documents (unlike profile field data) are not captured in the application
// snapshot — the reviewer reads them live — so an application returned for
// correction (NEEDS_EDIT) must let its owner replace them. Every other active
// status still keeps documents frozen while the file is actually under review.
export const PROFILE_DOCUMENT_LOCK_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.PENDING_PAYMENT,
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.UNDER_REVIEW,
];

type DbLike = typeof db | Prisma.TransactionClient;

export async function assertFacilitiesProfileEditable(client: DbLike, companyId: string) {
  const locked = await client.facilitiesApplication.findFirst({
    where: { companyId, status: { in: PROFILE_LOCK_STATUSES } },
    select: { id: true },
  });
  if (locked) {
    throw new ActionError("تا پایان بررسی پرونده فعال، اطلاعات و مدارک پروفایل شرکت قابل تغییر نیست", 409);
  }
}

// A company with any application actively under review keeps its profile
// documents frozen; NEEDS_EDIT is deliberately excluded so a correction that
// asks for a profile document (اساسنامه, آگهی تأسیس, …) can actually be acted on.
export async function assertFacilitiesProfileDocumentEditable(client: DbLike, companyId: string) {
  const locked = await client.facilitiesApplication.findFirst({
    where: { companyId, status: { in: PROFILE_DOCUMENT_LOCK_STATUSES } },
    select: { id: true },
  });
  if (locked) {
    throw new ActionError("تا پایان بررسی پرونده فعال، مدارک پروفایل شرکت قابل تغییر نیست", 409);
  }
}
