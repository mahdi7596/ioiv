import { fork, type ChildProcess } from "node:child_process";
import { db } from "@/lib/db";

export type FileJobResult = { state: "completed" | "incomplete"; reasonCode?: string; counts: Record<string, number>; [key: string]: unknown };
const WORKER_FLAG = "--maintenance-ipc-worker";
const WORK_BUDGET_MS = 60_000;

/** Parent owns coordination and the success report; per-object fences own deletion safety. */
export async function runFileMaintenanceJob(event: string, lockId: number, work: (deadline: number) => Promise<FileJobResult>, recordCompletion?: (result: FileJobResult) => Promise<void>) {
  if (process.argv.includes(WORKER_FLAG)) {
    if (!process.send || !process.connected) throw new Error("MAINTENANCE_IPC_REQUIRED");
    // If the lock owner dies, stop this worker. Individual operations remain crash-safe.
    const disconnected = () => process.exit(1);
    process.once("disconnect", disconnected);
    try {
      const result = await work(Date.now() + WORK_BUDGET_MS);
      await new Promise<void>((resolve, reject) => process.send!(result, error => error ? reject(error) : resolve()));
    } finally {
      await db.$disconnect();
      process.removeListener("disconnect", disconnected);
      if (process.connected) process.disconnect();
    }
    return;
  }

  let worker: ChildProcess | undefined;
  let heartbeat: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let stopped: Promise<void> | undefined;
  const stop = async () => {
    if (worker && worker.exitCode === null && worker.signalCode === null) worker.kill("SIGKILL");
    await stopped;
  };
  try {
    const result = await db.$transaction(async tx => {
      const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(${lockId}) AS locked`;
      if (!lock.locked) return null;
      worker = fork(process.argv[1], [WORKER_FLAG], { stdio: ["ignore", "inherit", "inherit", "ipc"] });
      stopped = new Promise<void>(resolve => worker!.once("close", () => resolve()));
      return new Promise<FileJobResult>((resolve, reject) => {
        let outcome: FileJobResult | undefined;
        let finished = false;
        const fail = (reason: string) => { if (finished) return; finished = true; void stop().then(() => reject(new Error(reason))); };
        const probe = async () => {
          if (finished) return;
          try { await tx.$queryRaw`SELECT 1`; }
          catch { fail("MAINTENANCE_LOCK_LOST"); return; }
          if (!finished) heartbeat = setTimeout(probe, 500);
        };
        heartbeat = setTimeout(probe, 500);
        // Leave substantial margin before Prisma's outer transaction timeout.
        deadline = setTimeout(() => fail("MAINTENANCE_DEADLINE"), WORK_BUDGET_MS + 20_000);
        worker!.on("message", (message: FileJobResult) => { if (message?.state === "completed" || message?.state === "incomplete") outcome = message; });
        worker!.once("error", () => fail("MAINTENANCE_WORKER_FAILED"));
        worker!.once("exit", code => {
          if (finished) return;
          finished = true;
          if (heartbeat) clearTimeout(heartbeat);
          if (deadline) clearTimeout(deadline);
          if (code === 0 && outcome) resolve(outcome); else reject(new Error("MAINTENANCE_WORKER_FAILED"));
        });
      });
    }, { maxWait: 3000, timeout: 100000 });
    // Report completion only after the lock transaction acknowledges its commit.
    if (!result) { console.warn(JSON.stringify({ event: `${event}_skipped`, reasonCode: "LOCK_HELD" })); process.exitCode = 2; }
    else { if (result.state === "completed") await recordCompletion?.(result); console.info(JSON.stringify({ event: `${event}_${result.state}`, ...result })); if (result.state !== "completed") process.exitCode = 2; }
  } finally {
    if (heartbeat) clearTimeout(heartbeat);
    if (deadline) clearTimeout(deadline);
    await stop();
  }
}
