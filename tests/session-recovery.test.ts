import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
const mocks = vi.hoisted(() => ({ token: undefined as string | undefined, set: vi.fn(), del: vi.fn(), user: vi.fn(), admin: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => mocks.token === undefined ? undefined : { value: mocks.token }, set: mocks.set, delete: mocks.del }) }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: mocks.user }, admin: { findUnique: mocks.admin } } }));
import { GET as reset } from "@/app/api/auth/session-reset/route";
import * as logout from "@/app/api/auth/logout/route";
import { createSession, getSession } from "@/lib/auth/session";
const secret = "phase13-synthetic-session-secret-123456789";
async function jwt(kind = "user", subjectId = "fixture", expires = "30m", signingSecret = secret) {
  return new SignJWT({ kind, subjectId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(expires).sign(new TextEncoder().encode(signingSecret));
}
describe("session recovery and intentional logout", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.token = undefined; vi.stubEnv("APP_URL", "https://sana.example"); vi.stubEnv("SESSION_SECRET", secret); mocks.user.mockResolvedValue({ id: "fixture" }); mocks.admin.mockResolvedValue({ active: true }); });
  afterEach(() => vi.unstubAllEnvs());
  it.each(["user", "admin"])("preserves live %s on GET without cookie mutation", async kind => {
    mocks.token = await jwt(kind); const response = await reset(); expect(response.status).toBe(303); expect(response.headers.get("location")).toBe(`https://sana.example/${kind === "admin" ? "admin" : "dashboard"}`); expect(response.headers.get("cache-control")).toBe("no-store"); expect(mocks.del).not.toHaveBeenCalled(); expect(mocks.set).not.toHaveBeenCalled();
  });
  it("absent cookie emits no deletion and makes no database query", async () => { expect((await reset()).headers.get("location")).toBe("https://sana.example/?session=reset"); expect(mocks.del).not.toHaveBeenCalled(); expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.admin).not.toHaveBeenCalled(); });
  it.each(["malformed", "expired", "signature", "kind", "emptySubject"])("clears demonstrably invalid %s without database access", async variant => {
    mocks.token = variant === "malformed" ? "broken" : await jwt(variant === "kind" ? "invalid" : "user", variant === "emptySubject" ? "" : "fixture", variant === "expired" ? "-1s" : "30m", variant === "signature" ? secret + "wrong" : secret);
    const response = await reset(); expect(response.status).toBe(303); expect(mocks.del).toHaveBeenCalledWith("sana_session"); expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each(["user", "admin", "inactiveAdmin"])("recovers %s subject no longer usable", async kind => { mocks.token = await jwt(kind === "user" ? "user" : "admin"); mocks.user.mockResolvedValue(null); mocks.admin.mockResolvedValue(kind === "inactiveAdmin" ? { active: false } : null); const response = await reset(); expect(response.status).toBe(303); expect(response.headers.get("location")).toBe(kind === "user" ? "https://sana.example/?session=reset" : "https://sana.example/admin/login?session=reset"); expect(mocks.del).toHaveBeenCalledOnce(); });
  it.each(["user", "admin"])("preserves %s cookie on database failure", async kind => { mocks.token = await jwt(kind); mocks.user.mockRejectedValue(new Error("private database sentinel")); mocks.admin.mockRejectedValue(new Error("private database sentinel")); const response = await reset(); expect(response.status).toBe(503); expect(await response.text()).not.toContain("sentinel"); expect(mocks.del).not.toHaveBeenCalled(); });
  it.each(["", "short"])("preserves cookie on secret misconfiguration %s", async value => { mocks.token = await jwt(); vi.stubEnv("SESSION_SECRET", value); expect((await reset()).status).toBe(503); expect(mocks.del).not.toHaveBeenCalled(); expect(await getSession()).toBe(null); });
  it.each(["", "broken", "http://sana.example", "https://sana.example/path"])("preserves cookie with invalid origin config %s", async value => { mocks.token = await jwt(); vi.stubEnv("APP_URL", value); expect((await reset()).status).toBe(503); expect(mocks.del).not.toHaveBeenCalled(); });
  it.each([null, "null", "https://evil.example", "https://sana.example/", "https://sana.example, https://evil.example"])("rejects logout origin %s before clearing", async origin => { const response = await logout.POST(new Request("http://evil.example/api/auth/logout", { method: "POST", headers: { ...(origin ? { origin } : {}), "x-forwarded-host": "sana.example" } })); expect(response.status).toBe(403); expect(mocks.del).not.toHaveBeenCalled(); });
  it("accepts normal same-origin form and redirects to configured host", async () => { const response = await logout.POST(new Request("http://internal/api/auth/logout", { method: "POST", headers: { origin: "https://sana.example", "content-type": "application/x-www-form-urlencoded", host: "evil.example" } })); expect(response.status).toBe(303); expect(response.headers.get("location")).toBe("https://sana.example/"); expect(mocks.del).toHaveBeenCalledOnce(); expect("GET" in logout).toBe(false); });
  it("logout fails closed on missing canonical origin", async () => { vi.stubEnv("APP_URL", ""); expect((await logout.POST(new Request("http://internal/api/auth/logout", { method: "POST" }))).status).toBe(503); expect(mocks.del).not.toHaveBeenCalled(); });
  it("production cookie retains HttpOnly Secure Lax root and 30 minute expiry", async () => { vi.stubEnv("NODE_ENV", "production"); const start = Date.now(); await createSession({ kind: "user", subjectId: "fixture" }); const [name, value, options] = mocks.set.mock.calls[0]; expect(name).toBe("sana_session"); expect(options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" }); expect(options.expires.getTime()).toBeGreaterThanOrEqual(start + 1800000); expect(options.expires.getTime()).toBeLessThan(Date.now() + 1800100); mocks.token = value; expect(await getSession()).toEqual({ kind: "user", subjectId: "fixture" }); });
});
