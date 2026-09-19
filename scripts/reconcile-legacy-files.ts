import { db } from "@/lib/db";
import { runFileMaintenanceJob } from "@/lib/maintenance/file-job";
import { reconcileLegacyFiles } from "@/lib/maintenance/legacy-files";
runFileMaintenanceJob("legacy_file_reconciliation", 730180806, reconcileLegacyFiles)
 .catch(() => { console.error(JSON.stringify({ event: "legacy_file_reconciliation_failed", reasonCode: "DEPENDENCY_OR_WORKER_FAILURE" })); process.exitCode = 1; })
 .finally(() => db.$disconnect());
