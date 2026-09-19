import { describe, expect, it, vi, afterEach } from "vitest";
const mocks=vi.hoisted(()=>({warn:vi.fn(),verify:vi.fn()}));
vi.mock("@/lib/logger",()=>({logger:{warn:mocks.warn}}));
vi.mock("@/lib/actions/auth",()=>({verifyOtp:mocks.verify,ActionError:class extends Error{status=400;}}));
import { POST } from "@/app/api/auth/verify-otp/route";
describe("verification request privacy",()=>{
 afterEach(()=>vi.unstubAllEnvs());
 it("does not log malformed-body excerpts",async()=>{
  vi.stubEnv("APP_URL","http://localhost");
  const response=await POST(new Request("http://localhost/api/auth/verify-otp",{method:"POST",headers:{origin:"http://localhost","content-type":"application/json"},body:"secret-otp-sentinel-123456"}));
  expect(response.status).toBe(400);
  expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain("sentinel");
  expect(mocks.verify).not.toHaveBeenCalled();
 });
});
