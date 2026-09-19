import { db } from "@/lib/db";
import { pruneOtpBatch } from "@/lib/maintenance/otp";

async function main() {
  const startedAt = Date.now();
  const result = await pruneOtpBatch();
  console.info(JSON.stringify({ event: `otp_prune_${result.state}`, ...result, durationMs: Date.now() - startedAt }));
  if (result.state !== "completed") process.exitCode = 2;
}
main().catch(() => { console.error(JSON.stringify({ event: "otp_prune_failed", reasonCode: "DATABASE_FAILURE" })); process.exitCode = 1; }).finally(() => db.$disconnect());
