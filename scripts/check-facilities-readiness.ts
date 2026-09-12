import { createHash } from "node:crypto";
import { statfs } from "node:fs/promises";

import { db } from "@/lib/db";
import { createFacilitiesScannerFromEnv } from "@/lib/facilities-files/scanner";
import { FilesystemFacilitiesPrivateStorage, getFacilitiesStorageRoot } from "@/lib/facilities-files/storage";
import { FACILITIES_UNAVAILABLE_RETENTION_MS } from "@/lib/facilities-files/retention";

async function main() {
  const appUrl = new URL(process.env.APP_URL ?? "invalid:");
  const urlReady = ["http:", "https:"].includes(appUrl.protocol) && !appUrl.username && !appUrl.password && (process.env.NODE_ENV !== "production" || appUrl.protocol === "https:");
  const [privileges] = await db.$queryRaw<Array<{ audit_update: boolean; audit_delete: boolean; audit_select: boolean; audit_insert: boolean; history_update: boolean; history_delete: boolean; history_insert: boolean }>>`
    SELECT has_table_privilege(current_user, '"FacilitiesAuditLog"', 'UPDATE') AS audit_update,
           has_table_privilege(current_user, '"FacilitiesAuditLog"', 'DELETE') AS audit_delete,
           has_table_privilege(current_user, '"FacilitiesAuditLog"', 'SELECT') AS audit_select,
           has_table_privilege(current_user, '"FacilitiesAuditLog"', 'INSERT') AS audit_insert,
           has_table_privilege(current_user, '"FacilitiesStatusHistory"', 'UPDATE') AS history_update,
           has_table_privilege(current_user, '"FacilitiesStatusHistory"', 'DELETE') AS history_delete,
           has_table_privilege(current_user, '"FacilitiesStatusHistory"', 'INSERT') AS history_insert`;
  const cutoff = new Date(Date.now() - FACILITIES_UNAVAILABLE_RETENTION_MS);
  const deletionCutoff = new Date(Date.now() - 10 * 60 * 1_000);
  const [agedUnavailable, agedDeletionBacklog] = await Promise.all([
    db.facilitiesFileUpload.count({ where: { lifecycleStatus: "UNAVAILABLE", createdAt: { lte: cutoff } } }),
    db.facilitiesFileDeletionTombstone.count({ where: { OR: [{ status: "PENDING", createdAt: { lte: deletionCutoff } }, { status: "RETRY_REQUIRED", nextAttemptAt: { lte: new Date() } }] } }),
  ]);

  const storage = new FilesystemFacilitiesPrivateStorage();
  const key = storage.createStagingKey();
  const canary = Buffer.from("sana-facilities-readiness-canary", "utf8");
  let storageReady = false;
  try {
    await storage.writeStaging(key, canary);
    storageReady = (await storage.readStaging(key)).equals(canary);
    await storage.remove(key);
    try { await storage.readStaging(key); storageReady = false; } catch { /* expected after deletion */ }
  } finally { await storage.remove(key).catch(() => undefined); }
  const scan = await createFacilitiesScannerFromEnv().scan({ storageKey: key, bytes: canary, byteSize: canary.byteLength, sha256: createHash("sha256").update(canary).digest("hex"), fileType: "PDF" });
  const disk = await statfs(getFacilitiesStorageRoot());
  const freeBytes = Number(disk.bavail) * Number(disk.bsize);
  const runtimeAppendOnly = Boolean(privileges?.audit_select && privileges?.audit_insert && privileges?.history_insert && !privileges?.audit_update && !privileges?.audit_delete && !privileges?.history_update && !privileges?.history_delete);
  const ready = Boolean(urlReady && runtimeAppendOnly && storageReady && scan.status === "PASSED" && agedUnavailable === 0 && agedDeletionBacklog === 0 && freeBytes >= 2 * 1024 * 1024 * 1024);
  console.info(JSON.stringify({ event: "facilities_m8_readiness", ready, appUrlReady: urlReady, runtimeAuditAndHistoryAppendOnly: runtimeAppendOnly, storageWriteReadDeleteReady: storageReady, scannerReady: scan.status === "PASSED", agedUnavailable, agedDeletionBacklog, diskFreeAtLeast2GiB: freeBytes >= 2 * 1024 * 1024 * 1024, exportApplicationLimit: 5000, exportRelatedRowLimit: 100000 }));
  if (!ready) process.exitCode = 1;
}

main().catch(() => { console.error(JSON.stringify({ event: "facilities_m8_readiness_failed", reasonCode: "UNEXPECTED" })); process.exitCode = 1; }).finally(async () => db.$disconnect());
