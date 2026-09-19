import type {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {storeOwnedFacilitiesFile,retryUnavailableFacilitiesScan} from "@/lib/facilities-files/service";
import {FilesystemFacilitiesPrivateStorage} from "@/lib/facilities-files/storage";
const mode=process.env.R7_CRASH_POINT!;
const storage=new FilesystemFacilitiesPrivateStorage(process.env.R7_STORAGE_ROOT!);
const passed={scan:async()=>({status:"PASSED" as const})};
const halt=async()=>{process.send?.({ready:true});await new Promise(()=>{});};
async function main(){if(process.env.PHASE1_ISOLATED_DB!=="true"||new URL(process.env.DATABASE_URL!).hostname!=="127.0.0.1")throw Error("isolated fixture required");
 const write=storage.writeStaging.bind(storage);storage.writeStaging=async(...args)=>{await write(...args);if(mode==="staging")await halt();};
 const promote=storage.promote.bind(storage);storage.promote=async(...args)=>{await promote(...args);if(mode==="promotion")await halt();};
 type TxFn=(callback:(tx:Prisma.TransactionClient)=>Promise<unknown>,options?:{maxWait?:number;timeout?:number;isolationLevel?:Prisma.TransactionIsolationLevel})=>Promise<unknown>;
 const transaction=db.$transaction.bind(db) as TxFn;db.$transaction=(async(callback:Parameters<TxFn>[0],options:Parameters<TxFn>[1])=>{const result=await transaction(callback,options);if(mode==="retry-claim"||mode==="attachment"||mode==="commit"){
  const live=await db.facilitiesFileUpload.findFirst({where:{bindingId:process.env.R7_BINDING_ID,idempotencyKey:process.env.R7_UPLOAD_KEY}});
  if(live&&((mode==="retry-claim"&&live.lifecycleStatus==="PENDING"&&live.retryToken)||(mode==="attachment"&&live.lifecycleStatus==="PENDING"&&live.storedFileId)||(mode==="commit"&&live.lifecycleStatus==="PASSED")))await halt();
 }return result;}) as typeof db.$transaction;
 if(mode==="retry-claim")await retryUnavailableFacilitiesScan({uploadId:process.env.R7_UPLOAD_ID!,storage,scanner:passed});
 else await storeOwnedFacilitiesFile({userId:process.env.R7_USER_ID!,bindingId:process.env.R7_BINDING_ID!,idempotencyKey:process.env.R7_UPLOAD_KEY!,fileName:"crash.pdf",bytes:Buffer.from(process.env.R7_BYTES!,"base64"),storage,scanner:passed});
 throw Error("crash boundary not reached");}
main().catch(()=>{process.send?.({error:true});process.exitCode=1;}).finally(()=>db.$disconnect());
