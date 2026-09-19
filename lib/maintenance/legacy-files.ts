import { db } from "@/lib/db";
import { retryLegacyFileDeletion } from "@/lib/uploads/replace";
import { reconcileLegacyCandidate } from "@/lib/uploads/candidates";
import { maintenancePage, advanceMaintenanceCursor, rotatedMaintenanceQueues } from "./cursor";
import type { FileJobResult } from "./file-job";

const LIMIT = 100;
export async function reconcileLegacyFiles(deadline: number): Promise<FileJobResult> {
  const [clock] = await db.$queryRaw<Array<{ cutoff: Date }>>`SELECT clock_timestamp() - interval '24 hours' AS cutoff`;
  const counts = { deleted: 0, retained: 0, candidatesSwept: 0, failures: 0, remaining: 0, resweepNotVisited: 0 };
  // Durable cursors rotate through failures and repeat abandoned sweeps.
  const intentsQueue = async (queueDeadline: number) => {
  const intents = await maintenancePage("legacy-intents", afterId => db.legacyFileDeletionIntent.findMany({ where: { ...(afterId ? { id: { gt: afterId } } : {}), status: { in: ["PENDING", "AUTHORIZED"] } }, orderBy: { id: "asc" }, take: LIMIT + 1 }));

  for (const intent of intents.slice(0, LIMIT)) {
    if (Date.now() >= queueDeadline) break;
    await advanceMaintenanceCursor("legacy-intents", intent.id);
    if (await retryLegacyFileDeletion(intent.id)) counts.deleted++;
    else {
      const current = await db.legacyFileDeletionIntent.findUniqueOrThrow({ where: { id: intent.id } });
      if (current.status === "RETAINED") counts.retained++; else counts.failures++;
    }
  }
  };
  const candidatesQueue = async (queueDeadline: number) => {
  const candidates = await maintenancePage("legacy-candidates", afterId => db.legacyUploadCandidate.findMany({ where: { ...(afterId ? { id: { gt: afterId } } : {}), status: { in: ["STAGING", "READY", "ABANDONED"] }, createdAt: { lte: clock.cutoff } }, orderBy: { id: "asc" }, take: LIMIT + 1 }));
  for (const candidate of candidates.slice(0, LIMIT)) {
    if (Date.now() >= queueDeadline) break;
    await advanceMaintenanceCursor("legacy-candidates", candidate.id);
    // Repeat old ABANDONED sweeps: a paused writer can write after a prior unlink.
    if (await reconcileLegacyCandidate(candidate.id)) counts.candidatesSwept++; else counts.failures++;
  }
  };
  for (const queue of await rotatedMaintenanceQueues("legacy-queue-order", [intentsQueue, candidatesQueue])) {
    await queue(Math.min(deadline - 5000, Date.now() + 25000));
  }
  counts.remaining = await db.legacyFileDeletionIntent.count({ where: { status: { in: ["PENDING", "AUTHORIZED"] } } });
  counts.remaining += await db.legacyUploadCandidate.count({ where: { status: { in: ["STAGING", "READY", "ABANDONED"] }, createdAt: { lte: clock.cutoff }, deletedAt: null } });
  const totalCandidates = await db.legacyUploadCandidate.count({ where: { status: { in: ["STAGING", "READY", "ABANDONED"] }, createdAt: { lte: clock.cutoff } } });
  // A bounded page does not prove other previously swept rows stayed absent.
  counts.resweepNotVisited = Math.max(0, totalCandidates - counts.candidatesSwept);
  const incomplete = counts.failures > 0 || counts.remaining > 0 || counts.resweepNotVisited > 0 || Date.now() >= deadline;
  return { state: incomplete ? "incomplete" : "completed", reasonCode: incomplete ? "RETRY_OR_BACKLOG" : undefined, counts };
}
