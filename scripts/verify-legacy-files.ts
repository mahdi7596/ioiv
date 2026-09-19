import { db } from "../lib/db";
import { createFacilitiesScannerFromEnv } from "../lib/facilities-files/scanner";
import { inventoryLegacyVerification, verifyHistoricalLegacyFile } from "../lib/uploads/historical-verification";

async function main() {
 const args=process.argv.slice(2);
 if(args[0]==="--inventory" && args.length<=2) {
  console.log(JSON.stringify(await inventoryLegacyVerification(args[1]),null,2)); return;
 }
 if(args[0]==="--verify-file" && args.length===2 && args[1]) {
  console.log(JSON.stringify(await verifyHistoricalLegacyFile(args[1],createFacilitiesScannerFromEnv()))); return;
 }
 throw new Error("Usage: --inventory [afterId] | --verify-file <fileId>; production access requires approved rollout and backups");
}
main().catch(()=>{console.error("LEGACY_VERIFICATION_FAILED: inspect current binding and retry safely; no document paths or content logged");process.exitCode=1;}).finally(()=>db.$disconnect());
