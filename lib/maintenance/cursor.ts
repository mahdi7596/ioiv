import { db } from "@/lib/db";

/** Persistent keyset cursor gives failed oldest records a turn without starving later ones. */
export async function maintenancePage<T extends { id: string }>(name: string, read: (afterId: string | null) => Promise<T[]>) {
  const cursor = await db.maintenanceCursor.findUnique({ where: { name } });
  let rows = await read(cursor?.afterId ?? null);
  if (!rows.length && cursor?.afterId) rows = await read(null);
  return rows;
}
export async function advanceMaintenanceCursor(name: string, afterId: string) {
  await db.maintenanceCursor.upsert({ where: { name }, create: { name, afterId }, update: { afterId } });
}

/** Persist next priority before I/O so a killed/hung queue cannot monopolize restarts. */
export async function rotatedMaintenanceQueues<T>(name: string, queues: T[]): Promise<T[]> {
  const cursor = await db.maintenanceCursor.findUnique({ where: { name } });
  const parsed = Number(cursor?.afterId ?? 0);
  const start = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed % queues.length : 0;
  await advanceMaintenanceCursor(name, String((start + 1) % queues.length));
  return [...queues.slice(start), ...queues.slice(0, start)];
}
