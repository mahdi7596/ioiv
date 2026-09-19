import { db } from "@/lib/db";
import { runFileMaintenanceJob } from "@/lib/maintenance/file-job";
import { reconcileFacilitiesFiles, recordFacilitiesCompletion } from "@/lib/maintenance/facilities-files";

runFileMaintenanceJob("facilities_file_reconciliation", 730_180_800, reconcileFacilitiesFiles, recordFacilitiesCompletion)
  .catch(() => { console.error(JSON.stringify({ event: "facilities_file_reconciliation_failed", reasonCode: "DEPENDENCY_OR_WORKER_FAILURE" })); process.exitCode = 1; })
  .finally(async () => db.$disconnect());
