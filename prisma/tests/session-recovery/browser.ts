import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
const owner = new PrismaClient({ datasources: { db: { url: process.env.PHASE1_OWNER_URL } } });
let server: ChildProcess | undefined;
const hostile = createServer((_req, res) => { res.setHeader("content-type", "text/html"); res.end(`<a id="reset">reset</a><form id="logout" method="post"><button>hostile logout</button></form>`); });
async function portFor(s: ReturnType<typeof createServer>) { await new Promise<void>(r => s.listen(0, "127.0.0.1", r)); return (s.address() as { port: number }).port; }
async function token(kind: string, id: string, expiry = "30m") { return new SignJWT({ subjectId: id, kind }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(expiry).sign(new TextEncoder().encode(process.env.SESSION_SECRET!)); }
async function main() {
 assert.equal(process.env.PHASE1_ISOLATED_DB, "true"); assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
 let closeBrowser: (() => Promise<void>) | undefined;
 try {
  const hostilePort = await portFor(hostile), probe = createServer(), port = await portFor(probe); await new Promise<void>(r => probe.close(() => r())); const base = `http://127.0.0.1:${port}`, hostileBase = `http://localhost:${hostilePort}`;
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], { env: { ...process.env, APP_URL: base, NODE_OPTIONS: `--require=${resolve("prisma/tests/otp-verification/no-external-fetch.cjs")}` }, stdio: ["ignore", "pipe", "pipe"] });
  let output = ""; server.stdout!.on("data", x => output += x); server.stderr!.on("data", x => output += x); const deadline = Date.now() + 30000; while (!output.includes("Ready in")) { assert.ok(Date.now() < deadline && server.exitCode === null, output); await new Promise(r => setTimeout(r, 50)); } console.log(JSON.stringify({ pid: server.pid, port, hostilePort }));
  const { chromium } = await import(process.env.PHASE1_PLAYWRIGHT!); const browser = await chromium.launch({ headless: true, channel: "chrome" }); closeBrowser = () => browser.close(); await mkdir(process.env.PHASE1_SCREENSHOTS!, { recursive: true });
  for (const width of [390, 1440]) {
   for (const kind of ["user", "admin"]) {
    const subject = kind === "user" ? await owner.user.create({ data: { mobile: `096${randomInt(10000000, 99999999)}` } }) : await owner.admin.create({ data: { mobile: `096${randomInt(10000000, 99999999)}`, name: "مدیر آزمایشی", role: "SUPER_ADMIN" } });
    const context = await browser.newContext({ viewport: { width, height: 900 } }); const value = await token(kind, subject.id); const cookie = { name: "sana_session", value, url: base, httpOnly: true, sameSite: "Lax" as const }; await context.addCookies([cookie]);
    await context.route("**/*", (route: { request: () => { url: () => string }; continue: () => Promise<void>; abort: () => Promise<void> }) => [base, hostileBase].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
    const page = await context.newPage();
    const preserved = await context.request.get(base + "/api/auth/session-reset", { maxRedirects: 0 }); assert.equal(preserved.status(), 303); assert.equal(preserved.headers()["set-cookie"], undefined);
    await page.goto(hostileBase); await page.locator("#reset").evaluate((e: HTMLAnchorElement, url: string) => e.href = url, base + "/api/auth/session-reset"); await page.locator("#reset").click(); await page.waitForURL(kind === "admin" ? base + "/admin" : base + "/dashboard/facilities-profile"); assert.equal((await context.cookies(base)).find((c: { name: string }) => c.name === "sana_session")?.value, value);
    const getLogout = await context.request.get(base + "/api/auth/logout", { maxRedirects: 0 }); assert.equal(getLogout.status(), 405); assert.equal(getLogout.headers()["set-cookie"], undefined);
    const forged = await context.request.post(base + "/api/auth/logout", { headers: { origin: hostileBase }, maxRedirects: 0 }); assert.equal(forged.status(), 403); assert.equal(forged.headers()["set-cookie"], undefined);
    await page.goto(hostileBase); await page.locator("#logout").evaluate((e: HTMLFormElement, url: string) => e.action = url, base + "/api/auth/logout"); const rejected = page.waitForResponse(base + "/api/auth/logout"); await page.getByRole("button", { name: "hostile logout" }).click(); assert.equal((await rejected).status(), 403); assert.equal((await context.cookies(base)).find((c: { name: string }) => c.name === "sana_session")?.value, value);
    await page.goto(base + (kind === "admin" ? "/admin" : "/dashboard/facilities-profile")); await page.getByRole("button", { name: "خروج", exact: true }).click(); await page.waitForURL(base + "/"); assert.equal((await context.cookies(base)).some((c: { name: string }) => c.name === "sana_session"), false); await page.reload(); assert.equal(page.url(), base + "/"); await page.goBack(); await page.reload(); assert.equal((await context.cookies(base)).some((c: { name: string }) => c.name === "sana_session"), false); await page.goto(base + "/"); await page.screenshot({ path: `${process.env.PHASE1_SCREENSHOTS}/logout-${kind}-${width}.png` });
    // Missing subject JWT must recover rather than bounce dashboard -> home indefinitely.
    await context.addCookies([{ ...cookie, value: await token(kind, "deleted-phase13-subject") }]); await page.goto(base + "/api/auth/session-reset"); await page.waitForURL(kind === "admin" ? base + "/admin/login?session=reset" : base + "/?session=reset"); assert.equal((await context.cookies(base)).some((c: { name: string }) => c.name === "sana_session"), false); await page.reload(); await page.screenshot({ path: `${process.env.PHASE1_SCREENSHOTS}/recovery-${kind}-${width}.png` });
    for (const bad of ["malformed", await token(kind, subject.id, "-1s")]) { await context.addCookies([{ ...cookie, value: bad }]); const response = await context.request.get(base + "/api/auth/session-reset", { maxRedirects: 0 }); assert.equal(response.status(), 303); assert.ok(response.headers()["set-cookie"]?.includes("sana_session=")); }
    await context.addCookies([cookie]);
    await owner.$executeRawUnsafe(`REVOKE SELECT ON "${kind === "admin" ? "Admin" : "User"}" FROM phase1_runtime`);
    try {
      const unavailable = await context.request.get(base + "/api/auth/session-reset", { maxRedirects: 0 });
      assert.equal(unavailable.status(), 503); assert.equal(unavailable.headers()["set-cookie"], undefined);
      assert.equal((await context.cookies(base)).find((c: { name: string }) => c.name === "sana_session")?.value, value);
    } finally { await owner.$executeRawUnsafe(`GRANT SELECT ON "${kind === "admin" ? "Admin" : "User"}" TO phase1_runtime`); }
    assert.equal((await context.request.get(base + "/api/auth/session-reset", { maxRedirects: 0 })).status(), 303);
    if (kind === "admin") {
      await owner.admin.update({ where: { id: subject.id }, data: { active: false } });
      const inactive = await context.request.get(base + "/api/auth/session-reset", { maxRedirects: 0 });
      assert.equal(inactive.status(), 303); assert.equal(inactive.headers()["location"], base + "/admin/login?session=reset");
      assert.ok(inactive.headers()["set-cookie"]?.includes("sana_session="));
    }
    await context.clearCookies(); const absent = await context.request.get(base + "/api/auth/session-reset", { maxRedirects: 0 }); assert.equal(absent.status(), 303); assert.equal(absent.headers()["set-cookie"], undefined); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); await context.close();
    console.log(`PASS ${kind} ${width}px valid hostileGET preserves, foreignPOST403, GETlogout405, actualform logout, refresh/back, deleted/malformed/expired/absent recovery; real permission failure503 preserves and recovery303; inactive admin clears`);
   }
  }
 } finally { await closeBrowser?.(); if (server && server.exitCode === null) { const stopped = new Promise<void>(r => server!.once("exit", () => r())); const kill = setTimeout(() => server!.kill("SIGKILL"), 5000); server.kill("SIGTERM"); await stopped; clearTimeout(kill); } await new Promise<void>(r => hostile.close(() => r())); await owner.$disconnect(); console.log("Owned Next/browser/hostile fixture stopped"); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
