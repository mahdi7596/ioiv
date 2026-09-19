import { fork, type ChildProcess } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { db } from "../../../lib/db";
import { reserveOtpGuess, consumeOtpForSession } from "../../../lib/auth/verification";
const children:ChildProcess[]=[];
const owner=new PrismaClient({datasources:{db:{url:process.env.PHASE1_OWNER_URL}}});
function child(mobile:string,mode:string,crash="") {
 const p=fork("prisma/tests/otp-verification/worker.ts",[mobile,mode,crash],{execArgv:["--import","tsx"],env:process.env,stdio:["ignore","ignore","pipe","ipc"]});children.push(p);
 const events:string[]=[];let stderr="";p.stderr?.on("data",c=>stderr+=c);
 p.on("message",(m:{stage:string})=>events.push(m.stage));
 const ended=new Promise<void>((resolve,reject)=>p.once("exit",code=>code===0||crash?resolve():reject(new Error(`worker failed: ${stderr}`))));
 async function stage(name:string) {const end=Date.now()+15000;while(!events.includes(name)){assert.ok(Date.now()<end,`worker missing ${name}`);await new Promise(r=>setTimeout(r,10));}}
 return {p,events,ended,stage};
}
async function main(){
 assert.equal(process.env.PHASE1_ISOLATED_DB,"true");const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,"127.0.0.1");assert.equal(url.pathname,"/phase1");
 const hash=await bcrypt.hash("123456",4);
 for(const mode of ["wrong","correct","reserved","consumed"]){
  await owner.$executeRaw`TRUNCATE "AuthVerifyBucket"`;
  const mobile=`092${randomInt(10000000,99999999)}`;
  const otp=await owner.otpCode.create({data:{mobile,purpose:"USER_LOGIN",codeHash:hash,expiresAt:new Date(Date.now()+120000)}});
  if(mode==="wrong"||mode==="correct"){
   const workers=Array.from({length:4},()=>child(mobile,mode));await Promise.all(workers.map(w=>w.stage("ready")));workers.forEach(w=>w.p.send("go"));await Promise.all(workers.map(w=>w.ended));
   const events=workers.flatMap(w=>w.events);const comparisons=events.filter(e=>e==="comparison").length;const authorized=events.filter(e=>e==="authorized").length;
   assert.ok(comparisons<=5);assert.equal(authorized,mode==="correct"?1:0);if(mode==="wrong")assert.equal(comparisons,5);
   console.log(`PASS four processes/twelve ${mode} requests: ${comparisons} real comparisons, ${authorized} session authorizations`);
  }else{
   const w=child(mobile,"correct",mode);await w.stage("ready");w.p.send("go");await w.stage(mode==="reserved"?"reserved":"authorized");w.p.kill("SIGKILL");await w.ended;
   const saved=await owner.otpCode.findUniqueOrThrow({where:{id:otp.id}});assert.equal(saved.attemptCount,1);
   if(mode==="reserved") {assert.equal(saved.consumedAt,null);const recovered=await reserveOtpGuess(mobile,"USER_LOGIN");assert.ok(recovered);assert.ok(await consumeOtpForSession(otp.id,mobile,"USER_LOGIN"));}
   else {assert.ok(saved.consumedAt);assert.equal(await reserveOtpGuess(mobile,"USER_LOGIN"),null);}
   console.log(`PASS SIGKILL after ${mode}: durable spent reservation; safe restart behavior`);
  }
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{for(const p of children)if(p.exitCode===null&&p.signalCode===null)p.kill("SIGKILL");await db.$disconnect();await owner.$disconnect();});
