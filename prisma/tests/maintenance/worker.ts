import { rotatedMaintenanceQueues } from "@/lib/maintenance/cursor";
import { db } from "@/lib/db";
import { runFileMaintenanceJob } from "@/lib/maintenance/file-job";
if (process.env.PHASE1_ISOLATED_DB !== "true" || new URL(process.env.DATABASE_URL!).hostname !== "127.0.0.1") throw Error("isolated fixture required");
runFileMaintenanceJob("fixture_maintenance", 730180899, async () => {
 const queues = await rotatedMaintenanceQueues("fixture-queue-order", ["blocking", "healthy"]);
 for (const queue of queues) {
  if (queue === "healthy") console.info("HEALTHY_QUEUE_EXECUTED");
  else { console.info(`WORKER_READY ${process.pid}`); await new Promise(resolve => setTimeout(resolve, 30000)); }
 }
 return {state:"completed",counts:{processed:1}};
}).catch(()=>{console.error("FIXTURE_FAILED");process.exitCode=1;}).finally(async()=>db.$disconnect());
