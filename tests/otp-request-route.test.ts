import { describe,it,expect,vi,afterEach,beforeEach } from "vitest";
const mocks=vi.hoisted(()=>({request:vi.fn(),warn:vi.fn()}));
vi.mock("@/lib/actions/auth",()=>({requestOtp:mocks.request,ActionError:class extends Error{status=400;}}));
vi.mock("@/lib/logger",()=>({logger:{warn:mocks.warn}}));
import { POST } from "@/app/api/auth/request-otp/route";
describe("OTP request route attribution and diagnostics",()=>{
 beforeEach(()=>{vi.stubEnv("APP_URL","http://localhost");});
 afterEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();});
 it("uses shared unknown unless proxy qualified; ignores XFF",async()=>{
  mocks.request.mockResolvedValue({next:"otp"});vi.stubEnv("OTP_VERIFY_TRUST_PROXY","false");
  await POST(new Request("http://localhost/api/auth/request-otp",{method:"POST",headers:{origin:"http://localhost","content-type":"application/json","x-real-ip":"203.0.113.1","x-forwarded-for":"203.0.113.2"},body:"{}"}));
  expect(mocks.request).toHaveBeenLastCalledWith({},{clientIp:null});
  vi.stubEnv("OTP_VERIFY_TRUST_PROXY","true");await POST(new Request("http://localhost",{method:"POST",headers:{origin:"http://localhost","content-type":"application/json","x-real-ip":"203.0.113.1"},body:"{}"}));expect(mocks.request).toHaveBeenLastCalledWith({},{clientIp:"203.0.113.1"});
 });
 it("does not log malformed content",async()=>{
  const response=await POST(new Request("http://localhost",{method:"POST",headers:{origin:"http://localhost","content-type":"application/json"},body:"private-otp-message"}));expect(response.status).toBe(400);expect(mocks.warn).not.toHaveBeenCalled();
 });
});
