import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { SignJWT } from "jose";
import { db } from "../../../lib/db";

async function main() {
  assert.equal(process.env.PHASE1_ISOLATED_DB, "true");
  const dbUrl = new URL(process.env.DATABASE_URL!);
  assert.equal(dbUrl.hostname, "127.0.0.1"); assert.equal(dbUrl.username, "phase1_runtime"); assert.equal(dbUrl.pathname, "/phase1");
  const traces: Array<{ authority: string; amount: number }> = [];
  const answers = new Map<string, number>();
  const provider = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    assert.equal(req.url, "/pg/v4/payment/verify.json");
    const data = JSON.parse(body); traces.push(data);
    const count = answers.get(data.authority) ?? 0; answers.set(data.authority, count + 1);
    res.setHeader("Content-Type", "application/json");
    if (data.authority[1] === "M") res.end(JSON.stringify({ data: { code: 100, ref_id: 0 }, errors: [] }));
    else res.end(JSON.stringify(count === 0 ? { data: [], errors: { code: -51 } } : { data: { code: 101, ref_id: 987654 }, errors: [] }));
  });
  await new Promise<void>(r => provider.listen(0, "127.0.0.1", r));
  const providerPort = (provider.address() as { port: number }).port;
  // Reserve a fresh application port; do not reuse previous phase server ports.
  const probe = createServer(); await new Promise<void>(r => probe.listen(0, "127.0.0.1", r));
  const port = (probe.address() as { port: number }).port; await new Promise<void>(r => probe.close(() => r()));
  const base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, APP_URL: base, ZARINPAL_MERCHANT_ID: "11111111-1111-1111-1111-111111111111", ZARINPAL_SANDBOX: "true", PHASE3_PROVIDER_URL: `http://127.0.0.1:${providerPort}`, NODE_OPTIONS: `--require=${resolve("prisma/tests/payment-coordination/phase3-fetch.cjs")}` };
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  let output = ""; server.stdout.on("data", c => { output += c; }); server.stderr.on("data", c => { output += c; });
  let closeBrowser: (() => Promise<void>) | undefined;
  console.log(JSON.stringify({ serverPid: server.pid, appPort: port, providerPort, source: process.cwd() }));
  try {
    const { chromium } = await import(process.env.PHASE1_PLAYWRIGHT!);
    const browser = await chromium.launch({ headless: true, channel: "chrome" });
    closeBrowser = () => browser.close();
    await new Promise<void>((resolveReady, reject) => {
      const timeout = setTimeout(() => { clearInterval(tick); reject(new Error(`server readiness timeout: ${output}`)); }, 30000);
      const tick = setInterval(() => { if (output.includes("Ready in")) { clearTimeout(timeout); clearInterval(tick); resolveReady(); } else if (server.exitCode !== null) { clearTimeout(timeout); clearInterval(tick); reject(new Error(output)); } }, 100);
    });
    await mkdir(process.env.PHASE1_SCREENSHOTS!, { recursive: true });
    for (const width of [390, 1440]) {
      for (const mode of ["M", "R"]) {
        const id = randomUUID(); const authority = `S${mode}00${id.replaceAll("-", "")}`;
        const user = await db.user.create({ data: { id, mobile: `fixture-${id}` } });
        const app = await db.application.create({ data: { userId: user.id, mobile: user.mobile, companyNationalId: id, status: "PENDING_PAYMENT" } });
        const payment = await db.payment.create({ data: { applicationId: app.id, amountToman: 765432, authority } });
        await db.paymentObligation.create({ data: { legacyApplicationId: app.id, legacyPaymentId: payment.id, amountToman: payment.amountToman, state: "PAYABLE" } });
        const token = await new SignJWT({ subjectId: id, kind: "user" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30m").sign(new TextEncoder().encode(process.env.SESSION_SECRET));
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        await context.route("**/*", (route: { request: () => { url: () => string }; continue: () => Promise<void>; abort: () => Promise<void> }) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
        await context.addCookies([{ name: "sana_session", value: token, url: base, httpOnly: true, sameSite: "Lax" }]);
        const page = await context.newPage();
        await page.goto(`${base}/payment/return?paymentId=${payment.id}&status=success&ref_id=999`);
        await page.getByRole("heading", { name: "وضعیت پرداخت هنوز مشخص نیست", exact: true }).waitFor();
        assert.equal(traces.filter(t => t.authority === authority).length, 0);
        const callback = `${base}/api/payment/callback?paymentId=${payment.id}&Authority=${authority}&Status=OK&amount=1&ref_id=999`;
        await page.goto(callback); await page.getByRole("heading", { name: "وضعیت پرداخت هنوز مشخص نیست", exact: true }).waitFor();
        assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status, "INITIATED");
        assert.equal(await db.statusHistory.count({ where: { applicationId: app.id } }), 0);
        await page.screenshot({ path: `${process.env.PHASE1_SCREENSHOTS}/${mode}-pending-${width}.png`, fullPage: true });
        await page.goto(callback);
        const heading = mode === "M" ? "وضعیت پرداخت هنوز مشخص نیست" : "پرداخت با موفقیت ثبت شد";
        await page.getByRole("heading", { name: heading, exact: true }).waitFor();
        await page.reload(); await page.getByRole("heading", { name: heading, exact: true }).waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
        const current = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
        assert.equal(current.status, mode === "M" ? "INITIATED" : "VERIFIED");
        assert.equal(await db.statusHistory.count({ where: { applicationId: app.id } }), mode === "M" ? 0 : 1);
        assert.equal(await db.payment.count({ where: { applicationId: app.id } }), 1);
        const calls = traces.filter(t => t.authority === authority); assert.equal(calls.length, mode === "M" ? 1 : 2); assert.ok(calls.every(c => c.amount === 765432));
        await page.screenshot({ path: `${process.env.PHASE1_SCREENSHOTS}/${mode}-result-${width}.png`, fullPage: true });
        await context.clearCookies(); await page.goto(`${base}/payment/return?paymentId=${payment.id}&status=success`);
        await page.getByRole("heading", { name: "وضعیت پرداخت مشخص نیست", exact: true }).waitFor();
        await context.close(); console.log(`PASS ${width}px ${mode === "M" ? "malformed reference blocks replay" : "rejection then101 recovers once"}: forged browser success, stored amount, original authority, refresh, no overflow, signed-out denial`);
      }
    }
  } finally {
    await closeBrowser?.();
    if (server.exitCode === null && server.signalCode === null) {
      const ended = new Promise<void>(r => server.once("exit", () => r()));
      const force = setTimeout(() => server.kill("SIGKILL"), 5000);
      server.kill("SIGTERM"); await ended; clearTimeout(force);
    }
    provider.closeAllConnections(); await new Promise<void>(r => provider.close(() => r())); await db.$disconnect();
    console.log("Owned Next/browser/provider stopped");
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
