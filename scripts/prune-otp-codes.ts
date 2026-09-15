import { db } from "@/lib/db";

/**
 * Deletes OTP rows older than the retention window in bounded batches. Runs
 * under an advisory lock so overlapping schedules cannot double-run. The window
 * must stay at or above the one-hour OTP rate-limit windows in lib/actions/auth.ts.
 */
const OTP_RETENTION_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 5_000;
const PRUNE_LOCK_ID = 730_180_801;

async function prune() {
  const cutoff = new Date(Date.now() - OTP_RETENTION_MS);
  let deleted = 0;
  for (;;) {
    const batch = await db.otpCode.findMany({ where: { createdAt: { lt: cutoff } }, select: { id: true }, take: BATCH_SIZE });
    if (!batch.length) break;
    const result = await db.otpCode.deleteMany({ where: { id: { in: batch.map((row) => row.id) } } });
    deleted += result.count;
    if (batch.length < BATCH_SIZE) break;
  }
  return deleted;
}

async function main() {
  const startedAt = Date.now();
  const outcome = await db.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(${PRUNE_LOCK_ID}) AS locked`;
    if (!row?.locked) return null;
    return prune();
  }, { timeout: 120_000, maxWait: 10_000 });
  if (outcome === null) {
    console.warn(JSON.stringify({ event: "otp_prune_skipped", reasonCode: "LOCK_HELD" }));
    process.exitCode = 2;
    return;
  }
  console.info(JSON.stringify({ event: "otp_prune_completed", deleted: outcome, durationMs: Date.now() - startedAt }));
}

main().catch(() => { console.error(JSON.stringify({ event: "otp_prune_failed", reasonCode: "UNEXPECTED" })); process.exitCode = 1; }).finally(async () => db.$disconnect());
