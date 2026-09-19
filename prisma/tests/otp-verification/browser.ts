import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const owner=new PrismaClient({datasources:{db:{url:process.env.PHASE1_OWNER_URL}}});
const servers:ChildProcess[]=[];
async function start(databaseUrl=process.env.DATABASE_URL){
 const probe=createServer();await new Promise<void>(r=>probe.listen(0,"127.0.0.1",r));const port=(probe.address() as {port:number}).port;await new Promise<void>(r=>probe.close(()=>r()));
 const base=`http://127.0.0.1:${port}`;
 const p=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p",String(port)],{env:{...process.env,DATABASE_URL:databaseUrl,APP_URL:base,NODE_OPTIONS:`--require=${resolve("prisma/tests/otp-verification/no-external-fetch.cjs")}`},stdio:["ignore","pipe","pipe"]});servers.push(p);
 let output="";p.stdout.on("data",c=>output+=c);p.stderr.on("data",c=>output+=c);
 const deadline=Date.now()+30000;while(!output.includes("Ready in")){assert.ok(Date.now()<deadline && p.exitCode===null,"server startup failed");await new Promise(r=>setTimeout(r,100));}
 console.log(JSON.stringify({serverPid:p.pid,port,source:process.cwd()}));return base;
}
async function main(){
 assert.equal(process.env.PHASE1_ISOLATED_DB,"true");const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,"127.0.0.1");assert.equal(url.pathname,"/phase1");assert.equal(url.username,"phase1_runtime");
 let closeBrowser:(()=>Promise<void>)|undefined;
 try{
  const bases=[await start(),await start()]; const base=bases[0];
  const {chromium}=await import(process.env.PHASE1_PLAYWRIGHT!);const browser=await chromium.launch({headless:true,channel:"chrome"});closeBrowser=()=>browser.close();
  const hash=await bcrypt.hash("123456",4);await mkdir(process.env.PHASE1_SCREENSHOTS!,{recursive:true});
  for(const width of [390,1440])for(const mode of ["user","admin"]){
   await owner.$executeRaw`TRUNCATE "AuthVerifyBucket"`;
   const mobile=`093${randomInt(10000000,99999999)}`;
   if(mode==="admin")await owner.admin.create({data:{mobile,name:"Synthetic phase4 browser admin",role:"ADMIN"}});
   const context=await browser.newContext({viewport:{width,height:900}});
   await context.route("**/*",(route:{request:()=>{url:()=>string};continue:()=>Promise<void>;abort:()=>Promise<void>})=>new URL(route.request().url()).origin===base?route.continue():route.abort());
   const page=await context.newPage();let verificationRequests=0;
   page.on("request",(request:{url:()=>string})=>{if(request.url().endsWith("/api/auth/verify-otp"))verificationRequests++;});
   await page.goto(`${base}${mode==="admin"?"/admin/login":"/"}`);
   await page.locator(mode==="admin"?"#admin-mobile":"#mobile").fill(mobile);
   const requested=page.waitForResponse((r:{url:()=>string})=>r.url().endsWith("/api/auth/request-otp"));
   await page.getByRole("button",{name:"دریافت کد تایید",exact:true}).click();assert.equal((await requested).status(),200);
   const otp=await owner.otpCode.findFirstOrThrow({where:{mobile},orderBy:{createdAt:"desc"}});
   await owner.otpCode.update({where:{id:otp.id},data:{codeHash:hash}});
   async function enter(code:string){
    const response=page.waitForResponse((r:{url:()=>string})=>r.url().endsWith("/api/auth/verify-otp"));
    if(mode==="admin"){await page.locator("#admin-otp").fill(code);await page.getByRole("button",{name:"ورود به پنل مدیریت",exact:true}).click();}
    else{for(let i=0;i<6;i++)await page.getByRole("textbox",{name:`رقم ${i+1} کد تایید`,exact:true}).fill(code[i]);}
    return response;
   }
   let release!:()=>void;let reached!:()=>void;
   const gate=new Promise<void>(r=>release=r);const intercepted=new Promise<void>(r=>reached=r);
   await page.route("**/api/auth/verify-otp",async(route:{continue:()=>Promise<void>})=>{reached();await gate;await route.continue();},{times:1});
   const invalid=enter("000000");await intercepted;
   try {assert.equal(await (mode==="admin"?page.getByRole("button",{name:"در حال بررسی...",exact:true}):page.getByRole("textbox",{name:"رقم 1 کد تایید",exact:true})).isDisabled(),true);}
   finally {release();}
   assert.equal((await invalid).status(),400);
   await page.getByRole("alert").filter({hasText:"کد تایید معتبر نیست"}).first().waitFor();
   assert.equal(verificationRequests,1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
   await page.screenshot({path:`${process.env.PHASE1_SCREENSHOTS}/${mode}-invalid-${width}.png`,fullPage:true});
   // Exhaust the shared budget with synthetic database times to exercise the real UI429.
   await owner.$executeRaw`UPDATE "AuthVerifyBucket" SET "attempts"=array_fill(clock_timestamp(),ARRAY[30]) WHERE "key" LIKE 'mobile:%'`;
   assert.equal((await enter("123456")).status(),429);
   await page.getByRole("alert").filter({hasText:"تعداد تلاش‌های ورود"}).first().waitFor();
   assert.equal(verificationRequests,2);
   await page.locator(".toast").last().waitFor({state:"hidden"});
   await page.screenshot({path:`${process.env.PHASE1_SCREENSHOTS}/${mode}-limited-${width}.png`,fullPage:true});
   // Advance only synthetic accounting beyond its rolling window; no app bypass.
   await owner.$executeRaw`UPDATE "AuthVerifyBucket" SET "attempts"=ARRAY[clock_timestamp()-interval '61 minutes']`;
   // Admin can submit again; user autosubmit requires clearing before re-entering.
   if(mode==="user")for(let i=0;i<6;i++)await page.getByRole("textbox",{name:`رقم ${i+1} کد تایید`,exact:true}).fill("");
   const success=await enter("123456");assert.equal(success.status(),200);
   await page.waitForURL((u:URL)=>mode==="admin" ? u.pathname === "/admin" : u.pathname.startsWith("/dashboard"));
   assert.equal(verificationRequests,3);
   assert.ok((await context.cookies()).some((c:{name:string;httpOnly:boolean})=>c.name==="sana_session"&&c.httpOnly));
   await page.reload();assert.ok(mode==="admin"?new URL(page.url()).pathname==="/admin":new URL(page.url()).pathname.startsWith("/dashboard"));
   await context.clearCookies();await page.goto(`${base}${mode==="admin"?"/admin":"/dashboard"}`);assert.equal(new URL(page.url()).pathname,mode==="admin"?"/admin/login":"/");
   await context.close();console.log(`PASS ${width}px ${mode}: real OTP request, invalid/429 accessible Persian errors, recovery, cookie, refresh and signed-out denial`);
  }
  for(const correct of [false,true]){
   await owner.$executeRaw`TRUNCATE "AuthVerifyBucket"`;const mobile=`094${randomInt(10000000,99999999)}`;
   const otp=await owner.otpCode.create({data:{mobile,purpose:"USER_LOGIN",codeHash:hash,expiresAt:new Date(Date.now()+120000)}});
   const results=await Promise.all(Array.from({length:12},(_,i)=>fetch(`${bases[i%2]}/api/auth/verify-otp`,{method:"POST",headers:{origin:bases[i%2],"content-type":"application/json"},body:JSON.stringify({mobile,code:correct?"123456":"000000",mode:"user"})})));
   assert.equal(results.filter(r=>r.status===200).length,correct?1:0);assert.equal(results.filter(r=>r.headers.has("set-cookie")).length,correct?1:0);
   const saved=await owner.otpCode.findUniqueOrThrow({where:{id:otp.id}});assert.ok(saved.attemptCount<=5);if(!correct)assert.equal(saved.attemptCount,5);
   console.log(`PASS two production Next processes/twelve ${correct?"correct":"wrong"} HTTP guesses: capped reservations, ${correct?1:0} actual cookies`);
  }
  // A fresh closed loopback endpoint proves actual connection failure, never a
  // production destination. Existing healthy fixture/server remains untouched.
  const unavailableProbe=createServer();await new Promise<void>(r=>unavailableProbe.listen(0,"127.0.0.1",r));
  const unavailablePort=(unavailableProbe.address() as {port:number}).port;
  await new Promise<void>(r=>unavailableProbe.close(()=>r()));
  const unavailableUrl=new URL(process.env.DATABASE_URL!);unavailableUrl.port=String(unavailablePort);unavailableUrl.searchParams.set("connect_timeout","1");
  const unavailableBase=await start(unavailableUrl.toString());
  const unavailableResponse=await fetch(`${unavailableBase}/api/auth/verify-otp`,{method:"POST",headers:{origin:unavailableBase,"content-type":"application/json"},body:JSON.stringify({mobile:"09500000001",code:"123456",mode:"user"})});
  assert.equal(unavailableResponse.status,503);assert.equal(unavailableResponse.headers.has("set-cookie"),false);
  console.log("PASS unavailable loopback PostgreSQL: HTTP503 and no cookie");

 }finally{
  try { await closeBrowser?.(); } finally {
  for(const server of servers){if(server.exitCode===null&&server.signalCode===null){const ended=new Promise<void>(r=>server.once("exit",()=>r()));const timeout=setTimeout(()=>server.kill("SIGKILL"),5000);server.kill("SIGTERM");await ended;clearTimeout(timeout);}}
  await owner.$disconnect();console.log("Owned browsers and all Next processes stopped");
  }
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
