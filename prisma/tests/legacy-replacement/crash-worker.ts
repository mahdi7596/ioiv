import { db } from "@/lib/db";
import { stageLegacyUpload } from "@/lib/uploads/candidates";
import { commitApplicantUpload } from "@/lib/uploads/coordination";
import { cleanupLegacyReplacements } from "@/lib/uploads/replace";
const point=process.env.R8_CRASH_POINT!;
async function halt(){process.send?.({ready:true});await new Promise(()=>{});}
async function main(){
 if(process.env.PHASE1_ISOLATED_DB!=="true"||new URL(process.env.DATABASE_URL!).hostname!=="127.0.0.1") throw Error("isolated fixture required");
 const create=db.legacyUploadCandidate.create.bind(db.legacyUploadCandidate);
 db.legacyUploadCandidate.create=(async args=>{const result=await create(args);if(point==="allocation")await halt();return result;}) as typeof db.legacyUploadCandidate.create;
 const update=db.legacyUploadCandidate.update.bind(db.legacyUploadCandidate);
 db.legacyUploadCandidate.update=(async args=>{if(point==="bytes"&&args.data.status==="READY")await halt();return update(args);}) as typeof db.legacyUploadCandidate.update;
 const deletion=db.legacyFileDeletionIntent.update.bind(db.legacyFileDeletionIntent);
 db.legacyFileDeletionIntent.update=(async args=>{const result=await deletion(args);if(point==="authorization"&&args.data.status==="AUTHORIZED")await halt();return result;}) as typeof db.legacyFileDeletionIntent.update;
 const applicationId=process.env.R8_APPLICATION_ID!,userId=process.env.R8_USER_ID!,fieldKey="creditReports.ceo";
 const stored=await stageLegacyUpload({applicationId,fieldKey,file:new File(["crash,synthetic\n1,2"],"crash.csv"),scanner:{scan:async()=>({status:"PASSED"})}});
 await commitApplicantUpload({applicationId,userId,fieldKey,stored,expectedGeneration:1});
 if(point==="commit")await halt();
 await cleanupLegacyReplacements(applicationId,fieldKey);
 throw Error("crash boundary not reached");
}
main().catch(()=>{process.send?.({error:true});process.exitCode=1;}).finally(()=>db.$disconnect());
