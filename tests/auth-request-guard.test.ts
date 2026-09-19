import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ request: vi.fn(), verify: vi.fn() }));
vi.mock("@/lib/actions/auth", () => ({ requestOtp: mocks.request, verifyOtp: mocks.verify, ActionError: class extends Error { status = 400; } }));
import { POST as requestOtp } from "@/app/api/auth/request-otp/route";
import { POST as verifyOtp } from "@/app/api/auth/verify-otp/route";

describe.each([requestOtp, verifyOtp])("authentication mutation trust boundary", (post) => {
  beforeEach(() => { vi.stubEnv("APP_URL", "https://sana.example"); mocks.request.mockResolvedValue({ next: "otp" }); mocks.verify.mockResolvedValue({ success: true }); });
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
  const make = (origin: string | null, type = "application/json") => new Request("http://internal:3000/api/auth/verify-otp", { method: "POST", headers: { ...(origin === null ? {} : { origin }), "content-type": type, host: "evil.example", "x-forwarded-host": "sana.example", "x-forwarded-proto": "https" }, body: "{}" });
  it.each([null,"null","https://evil.example","http://sana.example","https://sana.example:444","https://sana.example/","https://sana.example@evil.example","https://sana.example https://evil.example","https://sana.example, https://evil.example"])("rejects origin %s before parsing/action", async origin => {
    const req = make(origin); const parse = vi.spyOn(req,"json"); const response = await post(req);
    expect(response.status).toBe(403); expect(parse).not.toHaveBeenCalled(); expect(mocks.request).not.toHaveBeenCalled(); expect(mocks.verify).not.toHaveBeenCalled(); expect(response.headers.has("set-cookie")).toBe(false);
  });
  it.each(["text/plain","application/x-www-form-urlencoded","multipart/form-data","application/jsonp","application/problem+json","application/json, text/plain", "application/json; charset=latin1", ""])("rejects media %s before parsing/action", async type => {
    const req=make("https://sana.example",type);const parse=vi.spyOn(req,"json");expect((await post(req)).status).toBe(415);expect(parse).not.toHaveBeenCalled();expect(mocks.request).not.toHaveBeenCalled();expect(mocks.verify).not.toHaveBeenCalled();
  });
  it.each(["application/json","Application/JSON; charset=UTF-8",'application/json; charset="utf-8"'])("accepts browser JSON %s independent of internal Host/proxy",async type=>{expect((await post(make("https://sana.example",type))).status).toBe(200);});
  it.each(["", "broken", "https://user:pass@sana.example", "https://sana.example/path", "https://sana.example/?x=1", "https://sana.example/#x", "http://sana.example", "file:///tmp"])("fails closed on config %s",async config=>{vi.stubEnv("APP_URL",config);const req=make("https://sana.example");const parse=vi.spyOn(req,"json");expect((await post(req)).status).toBe(503);expect(parse).not.toHaveBeenCalled();expect(mocks.request).not.toHaveBeenCalled();expect(mocks.verify).not.toHaveBeenCalled();});
  it("rejects malformed same-origin JSON without action",async()=>{const req=make("https://sana.example");vi.spyOn(req,"json").mockRejectedValue(new SyntaxError("private sentinel"));const r=await post(req);expect(r.status).toBe(400);expect(await r.text()).not.toContain("sentinel");expect(mocks.request).not.toHaveBeenCalled();expect(mocks.verify).not.toHaveBeenCalled();});
});
