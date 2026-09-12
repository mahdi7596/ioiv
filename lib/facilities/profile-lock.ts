import { ApplicationStatus, type Prisma } from "@prisma/client";

import { ActionError } from "@/lib/actions/auth";
import { db } from "@/lib/db";

export const PROFILE_LOCK_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.PENDING_PAYMENT,
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.UNDER_REVIEW,
  ApplicationStatus.NEEDS_EDIT,
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
