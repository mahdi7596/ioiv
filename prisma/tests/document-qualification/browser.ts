import assert from "node:assert/strict";
import {randomInt,randomUUID} from "node:crypto";
import {createServer as httpServer} from "node:http";
import {createServer} from "node:net";
import {spawn,type ChildProcess} from "node:child_process";
import {mkdir,unlink} from "node:fs/promises";
import {resolve} from "node:path";
import {SignJWT} from "jose";
import {PrismaClient} from "@prisma/client";
const owner=new PrismaClient({datasources:{db:{url:process.env.PHASE1_OWNER_URL}}});
const bytes=Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\nstartxref\n0\n%%EOF\n");
let mode="clean",scans=0,server:ChildProcess|undefined;
const sockets=new Set<import("node:net").Socket>();
const scanner=createServer(socket=>{sockets.add(socket);socket.on("close",()=>sockets.delete(socket));let data=Buffer.alloc(0),done=false;socket.on("data",chunk=>{data=Buffer.concat([data,chunk]);if(done||data.length<10)return;let at=10;while(data.length>=at+4){const n=data.readUInt32BE(at);at+=4;if(n===0){done=true;scans++;if(mode==="unavailable")socket.destroy();else setTimeout(()=>socket.end(mode==="failed"?"stream: Synthetic FOUND\0":"stream: OK\0"),mode==="slow"?500:0);return;}if(data.length<at+n)return;at+=n;}});});
async function listen(s:ReturnType<typeof httpServer>|ReturnType<typeof createServer>){await new Promise<void>(r=>s.listen(0,"127.0.0.1",r));return(s.address() as {port:number}).port;}
async function token(id:string){return new SignJWT({subjectId:id,kind:"user"}).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("30m").sign(new TextEncoder().encode(process.env.SESSION_SECRET!));}
async function main(){assert.equal(process.env.PHASE1_ISOLATED_DB,"true");assert.equal(new URL(process.env.DATABASE_URL!).hostname,"127.0.0.1");let closeBrowser:(()=>Promise<void>)|undefined;
try{
 const scannerPort=await listen(scanner),probe=httpServer(),port=await listen(probe);await new Promise<void>(r=>probe.close(()=>r()));const base=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p",String(port)],{env:{...process.env,APP_URL:base,FACILITIES_CLAMAV_HOST:"127.0.0.1",FACILITIES_CLAMAV_PORT:String(scannerPort),FACILITIES_CLAMAV_TIMEOUT_MS:"1000",NODE_OPTIONS:`--require=${resolve("prisma/tests/otp-verification/no-external-fetch.cjs")}`},stdio:["ignore","pipe","pipe"]});let output="";server.stdout!.on("data",x=>output+=x);server.stderr!.on("data",x=>output+=x);const deadline=Date.now()+30000;while(!output.includes("Ready in")){assert.ok(Date.now()<deadline&&server.exitCode===null);await new Promise(r=>setTimeout(r,50));}console.log(JSON.stringify({pid:server.pid,port,scannerPort}));
 const {chromium}=await import(process.env.PHASE1_PLAYWRIGHT!);const browser=await chromium.launch({headless:true,channel:"chrome"});closeBrowser=()=>browser.close();await mkdir(process.env.PHASE1_SCREENSHOTS!,{recursive:true});
 for(const width of [390,1440]){
  mode="clean";const id=randomUUID();const user=await owner.user.create({data:{mobile:`096${randomInt(10000000,99999999)}`,companyNationalId:id,companyName:"شرکت آزمایشی"}});
  await owner.company.create({data:{userId:user.id,name:"شرکت آزمایشی",profileCompletedAt:new Date()}});
  const application=await owner.application.create({data:{userId:user.id,mobile:user.mobile,companyNationalId:id,applicationRound:"1403",currentStep:6,taxDeclarations:[{year:"1403"}],financials:[{year:"1403"}],humanResources:{employeeCount:2}}});
  const context=await browser.newContext({viewport:{width,height:900}});await context.addCookies([{name:"sana_session",value:await token(user.id),url:base,httpOnly:true,sameSite:"Lax"}]);await context.route("**/*",(route:{request:()=>{url:()=>string};continue:()=>Promise<void>;abort:()=>Promise<void>})=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const slots=["taxDeclarations.0.file","financials.0.file","humanResources.insuranceList","trialBalance.generalLedger","trialBalance.subsidiaryLedger","creditReports.company","creditReports.ceo","creditReports.boardMember"];
  for(const fieldKey of slots){const response=await context.request.post(base+"/api/uploads",{multipart:{applicationId:application.id,fieldKey,generation:"0",file:{name:"fixture.pdf",mimeType:"application/pdf",buffer:bytes}}});assert.equal(response.status(),200);}
  const payment=await owner.payment.create({data:{applicationId:application.id,amountToman:3000000,status:"VERIFIED",authority:`synthetic-${randomUUID()}`,referenceId:`fixture-${randomUUID()}`}});
  await owner.paymentObligation.create({data:{legacyApplicationId:application.id,legacyPaymentId:payment.id,amountToman:payment.amountToman,state:"SETTLED"}});
  await owner.application.update({where:{id:application.id},data:{status:"PENDING_PAYMENT"}});
  const binding=await owner.legacyFileBinding.findUniqueOrThrow({where:{applicationId_slotKey:{applicationId:application.id,slotKey:"creditReports.ceo"}},include:{currentFile:true}});await unlink(binding.currentFile.storagePath);
  const page=await context.newPage();await page.goto(base+"/payment/return?paymentId="+payment.id);await page.getByRole("heading",{name:"پرداخت ثبت شد؛ ارسال پرونده باقی مانده است"}).waitFor();await page.screenshot({path:`${process.env.PHASE1_SCREENSHOTS}/paid-repair-${width}.png`});
  await page.goto(base+"/dashboard/application");const retry=page.getByRole("button",{name:"بررسی وضعیت پرداخت",exact:true});await retry.waitFor();assert.equal(await retry.isEnabled(),true);await Promise.all([page.waitForNavigation({waitUntil:"load"}),retry.click()]);
  const deadline=Date.now()+15000;while((await owner.application.findUniqueOrThrow({where:{id:application.id}})).status!=="DRAFT"){assert.ok(Date.now()<deadline);await new Promise(r=>setTimeout(r,50));}
  await page.reload();await page.getByRole("button",{name:"ارسال پرونده",exact:true}).waitFor();await page.getByRole("button",{name:"ارسال پرونده",exact:true}).click();await page.getByText(/گزارش اعتباری مدیرعامل.*معتبر و در دسترس نیست/).first().waitFor();assert.equal(await page.locator(".final-review__notice--success").count(),0);await page.locator(".toast").first().waitFor({state:"hidden"});await page.screenshot({path:`${process.env.PHASE1_SCREENSHOTS}/document-error-${width}.png`});
  assert.equal(await owner.payment.count({where:{applicationId:application.id}}),1);assert.equal((await owner.application.findUniqueOrThrow({where:{id:application.id}})).status,"DRAFT");
  const repair=await context.request.post(base+"/api/uploads",{multipart:{applicationId:application.id,fieldKey:"creditReports.ceo",generation:"1",file:{name:"repair.pdf",mimeType:"application/pdf",buffer:bytes}}});assert.equal(repair.status(),200);
  await page.reload();await page.getByRole("button",{name:"ارسال پرونده",exact:true}).click();await page.waitForURL(base+"/dashboard");assert.equal((await owner.application.findUniqueOrThrow({where:{id:application.id}})).status,"SUBMITTED");assert.equal(await owner.payment.count({where:{applicationId:application.id}}),1);assert.equal(await owner.statusHistory.count({where:{applicationId:application.id,newStatus:"SUBMITTED"}}),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`${process.env.PHASE1_SCREENSHOTS}/submitted-${width}.png`});await context.close();
  console.log(`PASS ${width}px paid crash recovery, Persian document error, verified replacement and one submission with one preserved payment`);
 }
 console.log(`PASS controlled INSTREAM scanner calls ${scans}; no external requests`);
}finally{await closeBrowser?.();if(server&&server.exitCode===null){const stopped=new Promise<void>(r=>server!.once("exit",()=>r()));const kill=setTimeout(()=>server!.kill("SIGKILL"),5000);server.kill("SIGTERM");await stopped;clearTimeout(kill);}for(const socket of sockets)socket.destroy();await new Promise<void>(r=>scanner.close(()=>r()));await owner.$disconnect();console.log("Owned Next/browser/scanner stopped");}}
main().catch(error=>{console.error(error);process.exitCode=1;});
