import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomInt } from "node:crypto";
const sms = vi.hoisted(() => ({ send: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/sms", () => ({ sendSms: sms.send }));
vi.mock("@/lib/auth/session", () => ({ createSession: vi.fn() }));
// Timing is measured unmocked in the production HTTP/browser harness.
vi.mock("@/lib/auth/admin-response", async original => ({ ...await original<typeof import("@/lib/auth/admin-response")>(), waitForAdminResponse: vi.fn(async () => {}) }));
import { db } from "@/lib/db";
import { requestOtp, verifyOtp } from "@/lib/actions/auth";
import { ADMIN_REQUEST_MESSAGE } from "@/lib/auth/admin-response";
const enabled = process.env.PHASE1_ISOLATED_DB === "true";
const owner = enabled ? new PrismaClient({ datasources: { db: { url: process.env.PHASE1_OWNER_URL } } }) : null;
const expected = {next:"otp",warning:ADMIN_REQUEST_MESSAGE};
function number() { return `094${randomInt(10000000,99999999)}`; }
describe.runIf(enabled)("R6 restricted PostgreSQL admin enumeration", {timeout:20000}, () => {
 beforeAll(() => {const u=new URL(process.env.DATABASE_URL!);if(u.hostname!=="127.0.0.1"||u.pathname!=="/phase1"||u.username!=="phase1_runtime")throw Error("unsafe fixture");});
 beforeEach(async () => { vi.restoreAllMocks();sms.send.mockReset();sms.send.mockResolvedValue({ok:true});await owner!.$executeRaw`TRUNCATE "AuthVerifyBucket", "AuthRequestIntent"`; });
 afterAll(async () => {vi.unstubAllEnvs();await db.$disconnect();await owner?.$disconnect();});
 it.each(["unknown","inactive","ADMIN","SUPER_ADMIN","ENTRY_VIEWER"] as const)("identical response with correct side effects: %s", async kind => {
   const mobile=number();if(kind!=="unknown")await owner!.admin.create({data:{mobile,name:"Synthetic R6",role:kind==="inactive"?"ADMIN":kind,active:kind!=="inactive"}});
   const before={users:await owner!.user.count(),admins:await owner!.admin.count()};
   expect(await requestOtp({mobile,mode:"admin"})).toEqual(expected);
   const active=kind!=="unknown"&&kind!=="inactive";
   expect(sms.send).toHaveBeenCalledTimes(active?1:0);expect(await owner!.otpCode.count({where:{mobile}})).toBe(active?1:0);
   expect(await owner!.user.count()).toBe(before.users);expect(await owner!.admin.count()).toBe(before.admins);
   expect(await owner!.authRequestIntent.count()).toBe(1);
   await expect(requestOtp({mobile,mode:"admin"})).rejects.toMatchObject({status:429});
 });
 it("concurrent distinct unknown probes spend the shared unknown budget without accounts or dispatch", async () => {
   vi.stubEnv("OTP_MAX_REQUESTS_PER_IP_PER_WINDOW","4");try{
    const mobiles=Array.from({length:12},number),before=await owner!.admin.count();
    const result=await Promise.allSettled(mobiles.map(mobile=>requestOtp({mobile,mode:"admin"})));
    expect(result.filter(x=>x.status==="fulfilled")).toHaveLength(4);
    expect(result.filter(x=>x.status==="rejected"&&x.reason.status===429)).toHaveLength(8);
    expect(await owner!.authRequestIntent.count()).toBe(4);expect(await owner!.otpCode.count({where:{mobile:{in:mobiles}}})).toBe(0);
    expect(await owner!.admin.count()).toBe(before);expect(await owner!.user.count({where:{mobile:{in:mobiles}}})).toBe(0);expect(sms.send).not.toHaveBeenCalled();
   } finally {vi.unstubAllEnvs();}
 });
 it("unknown numbers cannot authenticate or create roles/accounts", async () => {
   const mobile=number();await requestOtp({mobile,mode:"admin"});await expect(verifyOtp({mobile,mode:"admin",code:"123456"})).rejects.toMatchObject({status:400});
   expect(await owner!.user.count({where:{mobile}})).toBe(0);expect(await owner!.admin.count({where:{mobile}})).toBe(0);
 });
 it("deactivated after request cannot consume the delivered code", async () => {
   const mobile=number();const admin=await owner!.admin.create({data:{mobile,name:"Synthetic R6",role:"ADMIN"}});
   expect(await requestOtp({mobile,mode:"admin"})).toEqual(expected);
   const call=sms.send.mock.calls[0] as unknown as [{params:{code:string}}];
   await owner!.admin.update({where:{id:admin.id},data:{active:false}});
   await expect(verifyOtp({mobile,mode:"admin",code:call[0].params.code})).rejects.toMatchObject({status:400});
   expect((await owner!.otpCode.findFirstOrThrow({where:{mobile}})).consumedAt).toBeNull();
 });
});
