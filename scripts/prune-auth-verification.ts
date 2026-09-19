import { db } from "@/lib/db";
// Hourly schedule required even with no login traffic; admission also prunes.
async function main() {
  const removed = await db.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(730180804)`;
    const rows = await tx.$queryRaw<Array<{ removed: number }>>`SELECT public.prune_auth_verify_buckets() AS removed`;
    const requests = await tx.$queryRaw<Array<{ removed: number }>>`SELECT public.prune_auth_request_intents() AS removed`;
    return rows[0].removed + requests[0].removed;
  }, { maxWait: 3000, timeout: 5000 });
  console.info(JSON.stringify({ event: "auth_verify_prune_completed", removed }));
}
main().catch(() => { console.error(JSON.stringify({ event: "auth_verify_prune_failed" })); process.exitCode = 1; })
  .finally(() => db.$disconnect());
