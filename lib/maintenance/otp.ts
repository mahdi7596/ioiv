import { db } from "@/lib/db";

/** One bounded batch, on the same connection/transaction as the distinct job lock. */
export async function pruneOtpBatch() {
  return db.$transaction(async tx => {
    const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(730180805) AS locked`;
    if (!lock.locked) return { state: "skipped" as const, reasonCode: "LOCK_HELD", deleted: 0 };
    const [result] = await tx.$queryRaw<Array<{ removed: number }>>`SELECT public.prune_expired_otp_codes() AS removed`;
    const [backlog] = await tx.$queryRaw<Array<{ remaining: boolean }>>`SELECT EXISTS(SELECT 1 FROM "OtpCode" WHERE "createdAt" < CURRENT_TIMESTAMP - interval '24 hours' AND "expiresAt" <= CURRENT_TIMESTAMP) AS remaining`;
    return { state: backlog.remaining ? "incomplete" as const : "completed" as const, reasonCode: backlog.remaining ? "BACKLOG_REMAINS" : null, deleted: result.removed };
  }, { maxWait: 3000, timeout: 10000 });
}
