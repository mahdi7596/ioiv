import { fork,type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { PrismaClient } from "@prisma/client";
import { randomInt } from "node:crypto";
import assert from "node:assert/strict";
const owner=new PrismaClient({datasources:{db:{url:process.env.PHASE1_OWNER_URL}}});const children:ChildProcess[]=[];
let count=0;const provider=createServer((req,res)=>{req.resume();req.on("end",()=>{count++;res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({IsSuccess:true}));});});
function worker(mobile:string,crash=""){
 const p=fork("prisma/tests/otp-request/worker.ts",[mobile,crash],{execArgv:["--import","tsx"],env:process.env,stdio:["ignore","ignore","ignore","ipc"]});children.push(p);const events:string[]=[];p.on("message",(m:{stage:string})=>events.push(m.stage));
 const ended=new Promise<void>((resolve,reject)=>p.once("exit",(code,signal)=>code===0||(crash&&signal==="SIGKILL")?resolve():reject(Error("worker failed"))));
 async function stage(value:string){const end=Date.now()+15000;while(!events.includes(value)){assert.ok(Date.now()<end&&!events.includes("error"),`missing ${value}`);await new Promise(r=>setTimeout(r,10));}}
 return {p,events,ended,stage};
}
async function main(){
 assert.equal(process.env.PHASE1_ISOLATED_DB,"true");assert.equal(new URL(process.env.DATABASE_URL!).hostname,"127.0.0.1");
 await new Promise<void>(r=>provider.listen(0,"127.0.0.1",r));const port=(provider.address() as {port:number}).port;process.env.GHASEDAK_BASE_URL=`http://127.0.0.1:${port}`;process.env.GHASEDAK_API_KEY="synthetic-local-only";process.env.SMS_SEND_IN_DEVELOPMENT="true";process.env.GHASEDAK_ALLOW_INSECURE_HTTP="true";
 console.log(JSON.stringify({providerPort:port,pid:process.pid}));
 for(const crash of ["","reserved","claimed","sent"]){
  await owner.$executeRaw`TRUNCATE "AuthVerifyBucket", "AuthRequestIntent"`;count=0;const mobile=`092${randomInt(10000000,99999999)}`;
  if(!crash){const workers=Array.from({length:8},()=>worker(mobile));await Promise.all(workers.map(w=>w.stage("ready")));workers.forEach(w=>w.p.send("go"));await Promise.all(workers.map(w=>w.ended));assert.equal(workers.flatMap(w=>w.events).filter(e=>e==="sent").length,1);assert.equal(count,1);}
  else{const w=worker(mobile,crash);await w.stage("ready");w.p.send("go");await w.stage(crash);w.p.kill("SIGKILL");await w.ended;assert.equal(count,crash==="sent"?1:0);}
  const retry=worker(mobile);await retry.stage("ready");retry.p.send("go");await retry.ended;assert.ok(retry.events.includes("limited"));assert.equal(count,!crash||crash==="sent"?1:0);
  console.log(`PASS ${crash||"eight independent processes"}: counted provider dispatches, restart cannot resend`);
 }
}main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{for(const p of children)if(p.exitCode===null&&p.signalCode===null)p.kill("SIGKILL");provider.closeAllConnections();await new Promise<void>(r=>provider.close(()=>r()));await owner.$disconnect();});
