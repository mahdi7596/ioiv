import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import { createHmac, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
const sms = vi.hoisted(() => ({ send: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/sms", () => ({ sendSms: sms.send }));
vi.mock("@/lib/auth/admin-response", async original => ({...await original<typeof import("@/lib/auth/admin-response")>(), waitForAdminResponse: vi.fn(async () => {})}));
vi.mock("@/lib/auth/session", () => ({ createSession: vi.fn() }));
import { db } from "@/lib/db";
import { requestOtp } from "@/lib/actions/auth";
import { reserveOtpRequest, claimOtpDispatch } from "@/lib/auth/request";
import { reserveVerificationBudget, verificationClientIp } from "@/lib/auth/verification";
const enabled=process.env.PHASE1_ISOLATED_DB==="true";
const owner=enabled?new PrismaClient({datasources:{db:{url:process.env.PHASE1_OWNER_URL}}}):null;
let mobile:string;
function request(){return requestOtp({mobile,mode:"user"});}
async function ageMobile(seconds=91){await owner!.$executeRaw`UPDATE "AuthVerifyBucket" SET "attempts"=ARRAY(SELECT t - (${seconds} * interval '1 second') FROM unnest("attempts") t) WHERE "key" LIKE 'request:mobile:%'`;}
function gate(){let enter!:()=>void,release!:()=>void;const reached=new Promise<void>(r=>enter=r),wait=new Promise<void>(r=>release=r);return {reached,release,hold:async()=>{enter();await wait;}};}

describe.runIf(enabled)("R5 restricted PostgreSQL request reservations",{timeout:20000},()=>{
 beforeAll(()=>{const u=new URL(process.env.DATABASE_URL!);if(u.hostname!=="127.0.0.1"||u.pathname!=="/phase1"||u.username!=="phase1_runtime")throw Error("unsafe fixture");});
 beforeEach(async()=>{vi.restoreAllMocks();sms.send.mockReset();sms.send.mockResolvedValue({ok:true});await owner!.$executeRaw`TRUNCATE "AuthVerifyBucket", "AuthRequestIntent"`;mobile=`093${randomInt(10000000,99999999)}`;});
 afterAll(async()=>{vi.restoreAllMocks();await db.$disconnect();await owner?.$disconnect();});
 it("eight simultaneous requests create and dispatch exactly one code",async()=>{
  const results=await Promise.allSettled(Array.from({length:8},request));
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  expect(results.filter(r=>r.status==="rejected"&&r.reason.status===429)).toHaveLength(7);
  expect(sms.send).toHaveBeenCalledOnce();expect(await owner!.otpCode.count({where:{mobile}})).toBe(1);
  const row=await owner!.otpCode.findFirstOrThrow({where:{mobile}});expect(row.requestIp).toBeNull();
 });
 it("five admissions per rolling hour survive SMS failures and cooldown expiry",async()=>{
  sms.send.mockRejectedValue(new Error("uncertain"));
  for(let i=0;i<5;i++){expect(await request()).toHaveProperty("warning");await ageMobile();}
  await expect(request()).rejects.toMatchObject({status:429});expect(sms.send).toHaveBeenCalledTimes(5);
 });
 it("slow provider blocks no transaction and duplicate requests cannot dispatch",async()=>{
  const g=gate();sms.send.mockImplementationOnce(async()=>{await g.hold();return {ok:true};});
  const pending=request();await g.reached;try{await expect(request()).rejects.toMatchObject({status:429});expect(await reserveVerificationBudget(mobile,"USER_LOGIN",null)).toBe(true);}finally{g.release();}await pending;expect(sms.send).toHaveBeenCalledOnce();
 });
 it("once-claim duplicates and mismatched identity never dispatch another code",async()=>{
  const intent=(await reserveOtpRequest(mobile,"USER_LOGIN",null))!;
  expect(await claimOtpDispatch(intent,"09100000000","USER_LOGIN","hash")).toBe(false);
  const r=await Promise.all(Array.from({length:8},()=>claimOtpDispatch(intent,mobile,"USER_LOGIN","hash")));
  expect(r.filter(Boolean)).toHaveLength(1);expect(await owner!.otpCode.count({where:{mobile}})).toBe(1);
 });
 it("expired delayed hashing cannot replace a newer code",async()=>{
  const old=(await reserveOtpRequest(mobile,"USER_LOGIN",null))!;await ageMobile();
  await owner!.$executeRaw`UPDATE "AuthRequestIntent" SET "createdAt"=clock_timestamp()-interval '91 seconds' WHERE "id"=${old.id}`;
  const fresh=(await reserveOtpRequest(mobile,"USER_LOGIN",null))!;expect(await claimOtpDispatch(fresh,mobile,"USER_LOGIN","new")).toBe(true);
  expect(await claimOtpDispatch(old,mobile,"USER_LOGIN","old")).toBe(false);expect((await owner!.otpCode.findFirstOrThrow({where:{mobile}})).codeHash).toBe("new");
 });
 it("hash failure spends admission and blocks immediate retry",async()=>{
  vi.spyOn(bcrypt,"hash").mockRejectedValueOnce(new Error("hash failed") as never);
  await expect(request()).rejects.toMatchObject({status:503});await expect(request()).rejects.toMatchObject({status:429});expect(sms.send).not.toHaveBeenCalled();
 });
 it("inactive admin admission spends address and mobile quota without OTP",async()=>{
  await expect(requestOtp({mobile,mode:"admin"})).resolves.toMatchObject({next:"otp",warning:expect.any(String)});
  await expect(requestOtp({mobile,mode:"admin"})).rejects.toMatchObject({status:429});expect(sms.send).not.toHaveBeenCalled();expect(await owner!.otpCode.count({where:{mobile}})).toBe(0);
 });
 it.each([null,"203.0.113.55"])("configured shared address cap includes rejected mobile attempts: %s",async address=>{
  vi.stubEnv("OTP_MAX_REQUESTS_PER_IP_PER_WINDOW","2");try{
   expect(await reserveOtpRequest(mobile,"USER_LOGIN",address)).not.toBeNull();expect(await reserveOtpRequest(mobile,"USER_LOGIN",address)).toBeNull();expect(await reserveOtpRequest("09100000001","ADMIN_LOGIN",address)).toBeNull();
  }finally{vi.unstubAllEnvs();}
 });
 it("request and verification budgets are independent",async()=>{
  await reserveOtpRequest(mobile,"USER_LOGIN",null);for(let i=0;i<30;i++)expect(await reserveVerificationBudget(mobile,"USER_LOGIN",null)).toBe(true);
  expect(await reserveVerificationBudget(mobile,"USER_LOGIN",null)).toBe(false);
  await ageMobile();expect(await reserveOtpRequest(mobile,"USER_LOGIN",null)).not.toBeNull();
 });
 it("global cap bounds rotating addresses and mobile allocation",async()=>{
  await reserveOtpRequest(mobile,"USER_LOGIN",null);await owner!.$executeRaw`UPDATE "AuthVerifyBucket" SET "attempts"=array_fill(clock_timestamp(),ARRAY[3000]) WHERE "key"='request:global'`;
  expect(await reserveOtpRequest("09100000002","USER_LOGIN","203.0.113.12")).toBeNull();expect(await owner!.authRequestIntent.count()).toBe(1);
 });
 it.each(["", "0", "3001", "garbage"])("invalid configuration fails closed: %s",async value=>{
  vi.stubEnv("OTP_MAX_REQUESTS_PER_IP_PER_WINDOW",value);try{await expect(request()).rejects.toMatchObject({status:503});expect(sms.send).not.toHaveBeenCalled();}finally{vi.unstubAllEnvs();}
 });
 it("missing/mixed secrets fail both request and verification namespaces",async()=>{
  await reserveOtpRequest(mobile,"USER_LOGIN",null);vi.stubEnv("OTP_VERIFY_LIMIT_SECRET","different-but-long-enough-secret-123456789");try{
   await expect(request()).rejects.toMatchObject({status:503});await expect(reserveVerificationBudget(mobile,"USER_LOGIN",null)).rejects.toThrow();
  }finally{vi.unstubAllEnvs();}
  vi.stubEnv("OTP_VERIFY_LIMIT_SECRET","");try{await expect(request()).rejects.toMatchObject({status:503});}finally{vi.unstubAllEnvs();}
 });
 it("failed claim transaction leaves old code valid and spends reservation",async()=>{
  const old=await owner!.otpCode.create({data:{mobile,purpose:"USER_LOGIN",codeHash:"old",expiresAt:new Date(Date.now()+120000)}});
  const intent=(await reserveOtpRequest(mobile,"USER_LOGIN",null))!;
  await owner!.otpCode.create({data:{id:intent.id,mobile:"fixture-other",purpose:"USER_LOGIN",codeHash:"collision",expiresAt:new Date()}});
  await expect(claimOtpDispatch(intent,mobile,"USER_LOGIN","new")).rejects.toThrow();expect((await owner!.otpCode.findUniqueOrThrow({where:{id:old.id}})).consumedAt).toBeNull();expect(await reserveOtpRequest(mobile,"USER_LOGIN",null)).toBeNull();
 });
 it("lost claim commit acknowledgement prevents SMS and retry",async()=>{
  const original=db.$transaction.bind(db);let calls=0;
  vi.spyOn(db,"$transaction").mockImplementation((async(callback:(tx:Prisma.TransactionClient)=>Promise<unknown>,options:Parameters<typeof db.$transaction>[1])=>{const result=await original(callback,options);if(++calls===2)throw Error("lost acknowledgement");return result;}) as typeof db.$transaction);
  await expect(request()).rejects.toMatchObject({status:503});expect(sms.send).not.toHaveBeenCalled();expect(await owner!.otpCode.count({where:{mobile}})).toBe(1);await expect(request()).rejects.toMatchObject({status:429});
 });
 it("required cleanup failure denies admission and recovery prunes first",async()=>{
  await owner!.$executeRawUnsafe('REVOKE EXECUTE ON FUNCTION public.prune_auth_request_intents() FROM phase1_runtime');
  try{await expect(request()).rejects.toMatchObject({status:503});expect(sms.send).not.toHaveBeenCalled();}finally{await owner!.$executeRawUnsafe('GRANT EXECUTE ON FUNCTION public.prune_auth_request_intents() TO phase1_runtime');}
  await owner!.authRequestIntent.create({data:{id:"expired",mobileKey:"protected",createdAt:new Date(Date.now()-86400000)}});
  await request();expect(await owner!.authRequestIntent.findUnique({where:{id:"expired"}})).toBeNull();
 });
 it("intent expiry is checked again after waiting on an unchanged OTP lock",async()=>{
  const intent=(await reserveOtpRequest(mobile,"USER_LOGIN",null))!;
  const [{at}]=await owner!.$queryRaw<Array<{at:Date}>>`SELECT clock_timestamp()-interval '89 seconds' AS at`;
  intent.mobileKey=`request:mobile:${createHmac("sha256",process.env.OTP_VERIFY_LIMIT_SECRET!).update(`mobile:${Math.floor(at.getTime()/3600000)}:USER_LOGIN:${mobile}`).digest("hex")}`;
  await owner!.authRequestIntent.update({where:{id:intent.id},data:{createdAt:at,mobileKey:intent.mobileKey}});
  const old=await owner!.otpCode.create({data:{mobile,purpose:"USER_LOGIN",codeHash:"old",expiresAt:new Date(Date.now()+120000)}});
  const held=gate();const blocker=owner!.$transaction(async tx=>{await tx.$queryRaw`SELECT "id" FROM "OtpCode" WHERE "id"=${old.id} FOR UPDATE`;await held.hold();});await held.reached;
  const pending=claimOtpDispatch(intent,mobile,"USER_LOGIN","new");
  try {let waiting=false;const end=Date.now()+1500;while(Date.now()<end){const rows=await owner!.$queryRaw<Array<{waiting:boolean}>>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='phase1_runtime' AND wait_event_type='Lock') AS waiting`;if(rows[0].waiting){waiting=true;break;}}expect(waiting).toBe(true);await owner!.$executeRaw`SELECT pg_sleep(1.1)`;}finally{held.release();await blocker;}
  expect(await pending).toBe(false);expect((await owner!.otpCode.findUniqueOrThrow({where:{id:old.id}})).consumedAt).toBeNull();
 });
 it("prunes expired identifying intents but keeps live claims",async()=>{
  await reserveOtpRequest(mobile,"USER_LOGIN",null);await owner!.authRequestIntent.create({data:{id:"old-retention",mobileKey:"protected-old",createdAt:new Date(Date.now()-3*3600000)}});
  await db.$queryRaw`SELECT public.prune_auth_request_intents()`;expect(await owner!.authRequestIntent.count()).toBe(1);
 });
 it("runtime cannot delete live intents or change Admin",async()=>{
  const rows=await db.$queryRaw<Array<{del:boolean;admin:boolean}>>`SELECT has_table_privilege(current_user,'"AuthRequestIntent"','DELETE') AS del,has_table_privilege(current_user,'"Admin"','UPDATE') AS admin`;
  expect(rows[0]).toEqual({del:false,admin:false});
 });
 it("current/previous epochs retain cooldown and rolling five without boundary resets",async()=>{
  const boundary=Math.floor(Date.now()/3600000)*3600000;let at=new Date(boundary-1000);
  const original=db.$transaction.bind(db);
  vi.spyOn(db,"$transaction").mockImplementation((async(callback:(tx:Prisma.TransactionClient)=>Promise<unknown>,options:Parameters<typeof db.$transaction>[1])=>original(async tx=>{
   const raw=tx.$queryRaw.bind(tx);const proxy=new Proxy(tx,{get(target,property){if(property==="$queryRaw")return(strings:TemplateStringsArray,...values:unknown[])=>strings.join("").includes("admission_clock")?Promise.resolve([{at,epoch:Math.floor(at.getTime()/3600000)}]):raw(strings,...values);return Reflect.get(target,property);}});return callback(proxy);
  },options)) as typeof db.$transaction);
  expect(await reserveOtpRequest(mobile,"USER_LOGIN",null)).not.toBeNull();at=new Date(boundary+1000);expect(await reserveOtpRequest(mobile,"USER_LOGIN",null)).toBeNull();
  for(let i=1;i<5;i++){at=new Date(boundary+i*91000);expect(await reserveOtpRequest(mobile,"USER_LOGIN",null)).not.toBeNull();}
  at=new Date(boundary+5*91000);expect(await reserveOtpRequest(mobile,"USER_LOGIN",null)).toBeNull();at=new Date(boundary+3600001);expect(await reserveOtpRequest(mobile,"USER_LOGIN",null)).not.toBeNull();
 });
 it("only qualified X-Real-IP is canonicalized; XFF cannot bypass unknown",()=>{
  vi.stubEnv("OTP_VERIFY_TRUST_PROXY","false");expect(verificationClientIp(new Headers({"x-real-ip":"203.0.113.1"}))).toBeNull();
  vi.stubEnv("OTP_VERIFY_TRUST_PROXY","true");expect(verificationClientIp(new Headers({"x-forwarded-for":"203.0.113.1"}))).toBeNull();expect(verificationClientIp(new Headers({"x-real-ip":"2001:0db8::1"}))).toBe("2001:db8::1");vi.unstubAllEnvs();
 });
});
