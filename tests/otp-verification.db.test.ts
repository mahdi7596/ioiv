import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { OtpPurpose, Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHmac, randomInt } from "node:crypto";
const sessions = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ createSession: sessions.create }));
vi.mock("@/lib/sms", () => ({ sendSms: vi.fn() }));
import { db } from "@/lib/db";
import { verifyOtp } from "@/lib/actions/auth";
import { consumeOtpForSession, reserveOtpGuess, reserveVerificationBudget, verificationClientIp } from "@/lib/auth/verification";
const enabled = process.env.PHASE1_ISOLATED_DB === "true";
const owner = enabled ? new PrismaClient({ datasources: { db: { url: process.env.PHASE1_OWNER_URL } } }) : null;
function barrier() { let release!: () => void; let enter!: () => void; const reached = new Promise<void>(r => enter = r); const wait = new Promise<void>(r => release = r); return { release, reached, hold: async () => { enter(); await wait; } }; }
let mobile: string; let hash: string;
async function code(purpose: OtpPurpose = "USER_LOGIN", expiry = 120000) {
  const [{ now }] = await owner!.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  return owner!.otpCode.create({ data: { mobile, purpose, codeHash: hash, expiresAt: new Date(now.getTime() + expiry) } });
}
function verify(value = "123456", mode = "user") { return verifyOtp({ mobile, code: value, mode }); }

describe.runIf(enabled)("R3 restricted PostgreSQL verification", { timeout: 20000 }, () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/phase1" || url.username !== "phase1_runtime") throw new Error("unsafe fixture");
    hash = await bcrypt.hash("123456", 4);
  });
  beforeEach(async () => {
    vi.restoreAllMocks(); sessions.create.mockReset(); sessions.create.mockResolvedValue(undefined);
    await owner!.$executeRaw`TRUNCATE "AuthVerifyBucket"`;
    mobile = `091${randomInt(10000000, 99999999)}`;
  });
  afterAll(async () => { vi.restoreAllMocks(); await db.$disconnect(); await owner?.$disconnect(); });

  it("twelve concurrent wrong requests compare the real code at most five times", async () => {
    const otp = await code(); const compare = vi.spyOn(bcrypt, "compare");
    const outcomes = await Promise.allSettled(Array.from({ length: 12 }, () => verify("000000")));
    expect(outcomes.every(r => r.status === "rejected")).toBe(true);
    expect(compare.mock.calls.filter(c => c[1] === hash)).toHaveLength(5);
    expect((await owner!.otpCode.findUniqueOrThrow({ where: { id: otp.id } })).attemptCount).toBe(5);
    expect(sessions.create).not.toHaveBeenCalled();
  });
  it("twelve concurrent correct requests issue exactly one session", async () => {
    await code(); const results = await Promise.allSettled(Array.from({ length: 12 }, () => verify()));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(sessions.create).toHaveBeenCalledOnce();
    expect(await owner!.user.count({ where: { mobile } })).toBe(1);
  });
  it("expiry during bcrypt prevents user creation and session", async () => {
    const otp = await code(); const gate = barrier();
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => { await gate.hold(); return true; });
    const pending = verify().catch(e => e); await gate.reached;
    await owner!.otpCode.update({ where: { id: otp.id }, data: { expiresAt: new Date(0) } }); gate.release();
    expect(await pending).toMatchObject({ status: 400 });
    expect(sessions.create).not.toHaveBeenCalled(); expect(await owner!.user.count({ where: { mobile } })).toBe(0);
  });
  it.each(["reserve", "consume"])("%s rechecks expiry after an unchanged row-lock wait", async stage => {
    const otp = await code("USER_LOGIN", 1000); if (stage === "consume") await reserveOtpGuess(mobile, "USER_LOGIN");
    const held = barrier();
    const blocker = owner!.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "OtpCode" WHERE "id" = ${otp.id} FOR UPDATE`;
      await held.hold();
    }); await held.reached;
    const pending = (stage === "reserve" ? reserveOtpGuess(mobile, "USER_LOGIN") : consumeOtpForSession(otp.id, mobile, "USER_LOGIN")).catch(e => e);
    // Wait until the runtime query is actually blocked, then advance to the
    // known DB deadline without modifying the locked tuple.
    const deadline = Date.now()+2000;
    let waiting=false;
    while(Date.now()<deadline) {
      const rows=await owner!.$queryRaw<Array<{waiting:boolean}>>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='phase1_runtime' AND wait_event_type='Lock') AS waiting`;
      if(rows[0].waiting) { waiting=true; break; }
    }
    expect(waiting).toBe(true);
    await owner!.$executeRaw`SELECT pg_sleep(GREATEST(0,EXTRACT(EPOCH FROM (${otp.expiresAt}::timestamptz-clock_timestamp())))::double precision)`;
    held.release(); await blocker;
    const result=await pending;
    if(stage==="reserve") expect(result).toBeNull(); else expect(result).toBeInstanceOf(Error);
    expect(sessions.create).not.toHaveBeenCalled();
    expect(await owner!.user.count({where:{mobile}})).toBe(0);
  });
  it("consumed and initially expired codes cannot reserve or issue cookies", async () => {
    const otp = await code("USER_LOGIN", -1);
    await expect(verify()).rejects.toMatchObject({ status: 400 });
    await owner!.otpCode.update({ where: { id: otp.id }, data: { expiresAt: new Date(Date.now()+120000), consumedAt: new Date() } });
    await expect(verify()).rejects.toMatchObject({ status: 400 }); expect(sessions.create).not.toHaveBeenCalled();
  });
  it("cookie failure spends the code and retry cannot create another session", async () => {
    const otp = await code(); sessions.create.mockRejectedValueOnce(new Error("cookie unavailable"));
    await expect(verify()).rejects.toMatchObject({ status: 503 });
    expect((await owner!.otpCode.findUniqueOrThrow({ where: { id: otp.id } })).consumedAt).not.toBeNull();
    await expect(verify()).rejects.toMatchObject({ status: 400 }); expect(sessions.create).toHaveBeenCalledOnce();
  });
  it("active admin succeeds without granting runtime administrative UPDATE", async () => {
    await owner!.admin.create({ data: { mobile, name: "Synthetic phase4 admin", role: "ADMIN" } });
    await code("ADMIN_LOGIN"); await expect(verify("123456", "admin")).resolves.toEqual({ redirectTo: "/admin" });
    const privilege = await db.$queryRaw<Array<{ allowed: boolean }>>`SELECT has_table_privilege(current_user, '"Admin"', 'UPDATE') AS allowed`;
    expect(privilege[0].allowed).toBe(false);
  });
  it("admin deactivated during comparison receives no session", async () => {
    const admin = await owner!.admin.create({ data: { mobile, name: "Synthetic phase4 admin", role: "ADMIN" } });
    await code("ADMIN_LOGIN"); const gate = barrier();
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => { await gate.hold(); return true; });
    const pending = verify("123456", "admin").catch(e => e); await gate.reached;
    await owner!.admin.update({ where: { id: admin.id }, data: { active: false } }); gate.release();
    expect(await pending).toMatchObject({ status: 400 }); expect(sessions.create).not.toHaveBeenCalled();
  });
  it("missing-code flood spends mobile budget; rejected mobile probes still spend address budget", async () => {
    for (let i=0;i<30;i++) expect(await reserveVerificationBudget(mobile,"USER_LOGIN",null)).toBe(true);
    expect(await reserveVerificationBudget(mobile,"USER_LOGIN",null)).toBe(false);
    const row = await owner!.$queryRaw<Array<{ count: number }>>`SELECT cardinality("attempts") AS count FROM "AuthVerifyBucket" WHERE "key"='address:unknown'`;
    expect(row[0].count).toBe(31);
    const compare = vi.spyOn(bcrypt,"compare"); await expect(verify()).rejects.toMatchObject({status:429}); expect(compare).not.toHaveBeenCalled();
  });
  it("unknown address is shared across mobiles and purposes", async () => {
    for(let i=0;i<300;i++) expect(await reserveVerificationBudget(`fixture-${i}`,"USER_LOGIN",null)).toBe(true);
    expect(await reserveVerificationBudget("new-admin","ADMIN_LOGIN",null)).toBe(false);
  });
  it.each(["address","global"])("%s budget rejects rotating mobiles without allocating new identifiers",async scope=>{
    await reserveVerificationBudget(mobile,"USER_LOGIN","203.0.113.8");
    if(scope==="address") await owner!.$executeRaw`UPDATE "AuthVerifyBucket" SET "attempts"=array_fill(clock_timestamp(),ARRAY[120]) WHERE "key" LIKE 'address:%'`;
    else await owner!.$executeRaw`UPDATE "AuthVerifyBucket" SET "attempts"=array_fill(clock_timestamp(),ARRAY[3000]) WHERE "key"='global'`;
    expect(await reserveVerificationBudget("another-mobile","USER_LOGIN","203.0.113.8")).toBe(false);
    expect(await owner!.authVerifyBucket.count()).toBe(3);
  });
  it("a consumed latest code cannot fall back to an older unused code",async()=>{
    await code();const latest=await code();await owner!.otpCode.update({where:{id:latest.id},data:{consumedAt:new Date(),createdAt:new Date(Date.now()+1000)}});
    expect(await reserveOtpGuess(mobile,"USER_LOGIN")).toBeNull();
  });
  it("an hour-boundary transaction uses one admission instant for epoch and events",async()=>{
    const boundary=Math.floor(Date.now()/3600000)*3600000;
    let admission=new Date(boundary-1); // clock captured just before hour, writes occur after it
    const original=db.$transaction.bind(db);
    vi.spyOn(db,"$transaction").mockImplementation((async (callback:(tx:Prisma.TransactionClient)=>Promise<unknown>,options:Parameters<typeof db.$transaction>[1])=>{
      return original(async tx=>{
        const raw=tx.$queryRaw.bind(tx);
        const proxy=new Proxy(tx,{get(target,property){
          if(property==="$queryRaw") return (strings:TemplateStringsArray,...values:unknown[])=>{
            if(strings.join("").includes("admission_clock"))return Promise.resolve([{epoch:Math.floor(admission.getTime()/3600000),at:admission}]);
            return raw(strings,...values);
          };
          return Reflect.get(target,property);
        }});
        return callback(proxy);
      },options);
    }) as typeof db.$transaction);
    for(let i=0;i<30;i++)expect(await reserveVerificationBudget(mobile,"USER_LOGIN",null)).toBe(true);
    const rows=await owner!.authVerifyBucket.findMany();
    expect(rows.every(row=>row.attempts.every(at=>at.getTime()===admission.getTime()))).toBe(true);
    admission=new Date(boundary+3600000-2); // still one millisecond inside rolling window
    expect(await reserveVerificationBudget(mobile,"USER_LOGIN",null)).toBe(false);
    admission=new Date(boundary+3600000+1);
    expect(await reserveVerificationBudget(mobile,"USER_LOGIN",null)).toBe(true);
  });
  it("hourly pseudonym rotation preserves the previous hour budget",async()=>{
    await reserveVerificationBudget(mobile,"USER_LOGIN",null);
    const [{epoch}]=await owner!.$queryRaw<Array<{epoch:number}>>`SELECT floor(extract(epoch FROM clock_timestamp())/3600)::integer AS epoch`;
    const previous=createHmac("sha256",process.env.OTP_VERIFY_LIMIT_SECRET!).update(`mobile:${epoch-1}:USER_LOGIN:${mobile}`).digest("hex");
    await owner!.$executeRaw`INSERT INTO "AuthVerifyBucket" ("key","attempts","touchedAt") VALUES (${`mobile:${previous}`},array_fill(clock_timestamp()-interval '1 minute',ARRAY[29]),clock_timestamp())`;
    expect(await reserveVerificationBudget(mobile,"USER_LOGIN",null)).toBe(false);
    await owner!.$executeRaw`UPDATE "AuthVerifyBucket" SET "attempts"=ARRAY[clock_timestamp()-interval '61 minutes'] WHERE "key"=${`mobile:${previous}`}`;
    expect(await reserveVerificationBudget(mobile,"USER_LOGIN",null)).toBe(true);
  });
  it("exact rolling window ignores stale events and retains recent events", async () => {
    await reserveVerificationBudget(mobile,"USER_LOGIN",null);
    await owner!.$executeRaw`UPDATE "AuthVerifyBucket" SET "attempts" = ARRAY[clock_timestamp()-interval '61 minutes',clock_timestamp()]`;
    expect(await reserveVerificationBudget(mobile,"USER_LOGIN",null)).toBe(true);
    const rows=await owner!.$queryRaw<Array<{ count:number }>>`SELECT cardinality("attempts") AS count FROM "AuthVerifyBucket"`;
    expect(rows.every(r=>r.count===2)).toBe(true);
  });
  it("cleanup only removes inactive keys; direct DELETE is denied", async () => {
    await reserveVerificationBudget(mobile,"USER_LOGIN",null);
    await owner!.$executeRaw`INSERT INTO "AuthVerifyBucket" VALUES ('old-key',NULL,ARRAY[clock_timestamp()-interval '3 hours'],clock_timestamp()-interval '3 hours')`;
    await expect(db.$executeRaw`DELETE FROM "AuthVerifyBucket"`).rejects.toThrow();
    const rows=await db.$queryRaw<Array<{ removed:number }>>`SELECT public.prune_auth_verify_buckets() AS removed`;
    expect(rows[0].removed).toBe(1); expect(await owner!.authVerifyBucket.count()).toBe(3);
  });
  it("cleanup failure denies before bcrypt and recovers after capability restoration", async () => {
    const compare=vi.spyOn(bcrypt,"compare");
    await owner!.$executeRawUnsafe('REVOKE EXECUTE ON FUNCTION public.prune_auth_verify_buckets() FROM phase1_runtime');
    try { await expect(verify()).rejects.toMatchObject({status:503}); expect(compare).not.toHaveBeenCalled(); }
    finally { await owner!.$executeRawUnsafe('GRANT EXECUTE ON FUNCTION public.prune_auth_verify_buckets() TO phase1_runtime'); }
    await code(); await expect(verify()).resolves.toEqual({redirectTo:"/dashboard"});
  });
  it("reservation DB failure denies before compare and recovers", async () => {
    await code(); const compare=vi.spyOn(bcrypt,"compare");
    await owner!.$executeRawUnsafe('REVOKE UPDATE ON "OtpCode" FROM phase1_runtime');
    try { await expect(verify()).rejects.toMatchObject({status:503}); expect(compare).not.toHaveBeenCalled(); }
    finally { await owner!.$executeRawUnsafe('GRANT UPDATE ON "OtpCode" TO phase1_runtime'); }
    await expect(verify()).resolves.toEqual({redirectTo:"/dashboard"});
  });
  it("lock conflict times out safely, spends capacity, and recovers", async () => {
    const otp=await code();const gate=barrier();
    const blocker=owner!.$transaction(async tx=>{await tx.$queryRaw`SELECT "id" FROM "OtpCode" WHERE "id"=${otp.id} FOR UPDATE`;await gate.hold();},{timeout:10000});
    await gate.reached;const compare=vi.spyOn(bcrypt,"compare");
    try {await expect(verify()).rejects.toMatchObject({status:503});expect(compare).not.toHaveBeenCalled();}
    finally {gate.release();await blocker;}
    await expect(verify()).resolves.toEqual({redirectTo:"/dashboard"});
  });
  it("consume write failure rolls back user creation but keeps spent guess", async () => {
    const otp=await code();const actual=bcrypt.compare.bind(bcrypt);
    vi.spyOn(bcrypt,"compare").mockImplementation(async (value,hash)=>{
      await owner!.$executeRawUnsafe('REVOKE INSERT ON "User" FROM phase1_runtime');
      return actual(value,hash);
    });
    try {await expect(verify()).rejects.toMatchObject({status:503});}
    finally {await owner!.$executeRawUnsafe('GRANT INSERT ON "User" TO phase1_runtime');}
    const saved=await owner!.otpCode.findUniqueOrThrow({where:{id:otp.id}});
    expect(saved.attemptCount).toBe(1);expect(saved.consumedAt).toBeNull();expect(sessions.create).not.toHaveBeenCalled();
    expect(await owner!.user.count({where:{mobile}})).toBe(0);
  });
  it("lost commit acknowledgement never issues a cookie or reopens the consumed OTP", async () => {
    const otp=await code(); let calls=0;
    const original=db.$transaction.bind(db);
    vi.spyOn(db,"$transaction").mockImplementation((async (...args: Parameters<typeof db.$transaction>) => {
      const result=await original(...args);
      if(++calls===3) throw new Error("injected commit acknowledgement lost");
      return result;
    }) as typeof db.$transaction);
    await expect(verify()).rejects.toMatchObject({status:503});
    expect((await owner!.otpCode.findUniqueOrThrow({where:{id:otp.id}})).consumedAt).not.toBeNull();
    expect(sessions.create).not.toHaveBeenCalled();
    await expect(verify()).rejects.toMatchObject({status:400});
  });
  it("missing or inconsistent secrets deny without resetting budgets", async () => {
    await reserveVerificationBudget(mobile,"USER_LOGIN",null); const secret=process.env.OTP_VERIFY_LIMIT_SECRET;
    try { process.env.OTP_VERIFY_LIMIT_SECRET=""; await expect(verify()).rejects.toMatchObject({status:503});
      process.env.OTP_VERIFY_LIMIT_SECRET="different-protected-secret-at-least32"; await expect(verify()).rejects.toMatchObject({status:503}); }
    finally { process.env.OTP_VERIFY_LIMIT_SECRET=secret; }
    expect(await owner!.authVerifyBucket.count()).toBe(3); expect(sessions.create).not.toHaveBeenCalled();
  });
  it("new accounting contains no raw mobile or IP", async () => {
    await reserveVerificationBudget(mobile,"USER_LOGIN","203.0.113.4");
    const encoded=JSON.stringify(await owner!.authVerifyBucket.findMany()); expect(encoded).not.toContain(mobile); expect(encoded).not.toContain("203.0.113.4");
  });
  it("ignores untrusted forwarded identity; canonicalizes qualified IPv6", () => {
    const prior=process.env.OTP_VERIFY_TRUST_PROXY;
    try { process.env.OTP_VERIFY_TRUST_PROXY="false"; expect(verificationClientIp(new Headers({"x-real-ip":"203.0.113.4"}))).toBeNull();
      process.env.OTP_VERIFY_TRUST_PROXY="true"; expect(verificationClientIp(new Headers({"x-forwarded-for":"203.0.113.4"}))).toBeNull();
      expect(verificationClientIp(new Headers({"x-real-ip":"2001:0db8:0:0:0:0:0:1"}))).toBe("2001:db8::1"); }
    finally { process.env.OTP_VERIFY_TRUST_PROXY=prior; }
  });
});
