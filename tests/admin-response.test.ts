import { afterEach, describe, expect, it, vi } from "vitest";
const delay = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("node:timers/promises",()=>({setTimeout:delay}));
import { adminResponseDeadline, waitForAdminResponse } from "@/lib/auth/admin-response";
import { smsRequestTimeoutMs } from "@/lib/sms/timeout";
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();delay.mockClear();});
describe("R6 uniform admin response floor",()=>{
 it.each([["",10000],["bad",10000],["1",1000],["100000",30000],["5000",5000]])("shares provider timeout calculation %s",(value,expected)=>{
  vi.stubEnv("SMS_REQUEST_TIMEOUT_MS",String(value));vi.spyOn(performance,"now").mockReturnValue(100);
  expect(smsRequestTimeoutMs()).toBe(expected);expect(adminResponseDeadline()).toBe(100+Number(expected)+12000);
 });
 it("waits remaining duration after work and never detaches dispatch",async()=>{
  vi.spyOn(performance,"now").mockReturnValue(1500);await waitForAdminResponse(2000);expect(delay).toHaveBeenCalledWith(500);
  await waitForAdminResponse(1000);expect(delay).toHaveBeenLastCalledWith(0);
 });
});
