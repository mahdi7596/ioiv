import { db } from "../../../lib/db";
import { reserveOtpGuess, consumeOtpForSession, reserveVerificationBudget } from "../../../lib/auth/verification";
import bcrypt from "bcryptjs";
import assert from "node:assert/strict";
async function main() {
  assert.equal(process.env.PHASE1_ISOLATED_DB,"true");
  const url=new URL(process.env.DATABASE_URL!); assert.equal(url.hostname,"127.0.0.1"); assert.equal(url.username,"phase1_runtime"); assert.equal(url.pathname,"/phase1");
  process.send?.({stage:"ready"});
  await new Promise<void>(r=>process.once("message",()=>r()));
  const [mobile,mode,crash]=process.argv.slice(2);
  for(let i=0;i<(crash?1:3);i++) {
    if(!await reserveVerificationBudget(mobile,"USER_LOGIN",null)) {process.send?.({stage:"limited"});continue;}
    const otp=await reserveOtpGuess(mobile,"USER_LOGIN");
    if(!otp) continue;
    process.send?.({stage:"reserved"});
    if(crash==="reserved") await new Promise(()=>{});
    process.send?.({stage:"comparison"});
    if(!await bcrypt.compare(mode==="correct"?"123456":"000000",otp.codeHash)) continue;
    try {
      const result=await consumeOtpForSession(otp.id,mobile,"USER_LOGIN");
      if(result) process.send?.({stage:"authorized"});
      if(crash==="consumed") await new Promise(()=>{});
    } catch { process.send?.({stage:"rejected"}); }
  }
}
main().catch(()=>{process.send?.({stage:"error"});process.exitCode=1;}).finally(async()=>{await db.$disconnect();process.disconnect?.();});
