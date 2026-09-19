import { db } from "../../../lib/db";
import { reserveOtpRequest, claimOtpDispatch } from "../../../lib/auth/request";
import { sendSms } from "../../../lib/sms";
import assert from "node:assert/strict";
async function main(){
 assert.equal(process.env.PHASE1_ISOLATED_DB,"true");assert.equal(new URL(process.env.DATABASE_URL!).hostname,"127.0.0.1");assert.equal(new URL(process.env.GHASEDAK_BASE_URL!).hostname,"127.0.0.1");
 const [mobile,crash]=process.argv.slice(2);process.send?.({stage:"ready"});await new Promise<void>(r=>process.once("message",()=>r()));
 const intent=await reserveOtpRequest(mobile,"USER_LOGIN",null);if(!intent){process.send?.({stage:"limited"});return;}
 process.send?.({stage:"reserved"});if(crash==="reserved")await new Promise(()=>{});
 if(!await claimOtpDispatch(intent,mobile,"USER_LOGIN","synthetic-hash"))throw Error("claim failed");
 process.send?.({stage:"claimed"});if(crash==="claimed")await new Promise(()=>{});
 await sendSms({to:mobile,text:"synthetic fixture",template:"fixture",params:{code:"synthetic"}});
 process.send?.({stage:"sent"});if(crash==="sent")await new Promise(()=>{});
}
main().catch(()=>{process.send?.({stage:"error"});process.exitCode=1;}).finally(async()=>{await db.$disconnect();process.disconnect?.();});
