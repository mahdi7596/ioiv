import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { db } from "../../../lib/db";
import { lockPaymentApplication, paymentObligation } from "../../../lib/payments/coordination";
async function main() {
  assert.equal(process.env.PHASE1_ISOLATED_DB, "true");
  const trace: string[] = [];
  const server = createServer(async (req, res) => { let body = ""; for await (const c of req) body += c; const data = JSON.parse(body); trace.push(req.url!.includes("request") ? "request" : data.authority); res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ data: req.url!.includes("request") ? { code: 100, authority: `S000${randomUUID().replaceAll("-", "")}` } : { code: 100, ref_id: 201 }, errors: [] })); });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const address = server.address() as { port: number };
  const env = { ...process.env, PHASE1_PROVIDER_URL: `http://127.0.0.1:${address.port}`, ZARINPAL_MERCHANT_ID: "11111111-1111-1111-1111-111111111111", ZARINPAL_SANDBOX: "true" };
  function worker(mode: string, id: string, stop = "") {
    const child = spawn(process.execPath, ["--import", "tsx", "prisma/tests/payment-coordination/worker.ts", mode, id, stop], { env, stdio: ["ignore", "ignore", "inherit", "ipc"] });
    const messages: string[] = []; const listeners: Array<() => void> = [];
    child.on("message", (message: unknown) => { const m = message as { error?: string; stage: string }; if (m.error) messages.push(`ERROR:${m.error}`); else messages.push(m.stage); listeners.splice(0).forEach(f => f()); });
    return { child, wait: async (stage: string) => { const deadline = setTimeout(() => { child.kill("SIGKILL"); listeners.splice(0).forEach(f => f()); }, 15000); try { while (!messages.includes(stage)) { if (messages.some(m => m.startsWith("ERROR"))) throw new Error(messages.join(",")); if (child.exitCode !== null || child.killed) throw new Error(`worker ended before ${stage}: ${messages}`); await new Promise<void>(r => listeners.push(r)); } } finally { clearTimeout(deadline); } }, stop: async () => { if (child.exitCode !== null || child.signalCode) return; const ended = new Promise<void>(r => child.once("exit", () => r())); child.kill("SIGKILL"); await ended; } };
  }
  async function app() { const id = randomUUID(); await db.user.create({ data: { id, mobile: id } }); return (await db.application.create({ data: { userId: id, mobile: id, companyNationalId: id } })).id; }
  try {
    for (const stage of ["reserved", "request-response", "authority-evidence"]) {
      const id = await app(); const before = trace.length; const a = worker("start", id, stage); await a.wait(stage);
      const b = worker("start", id); await b.wait("blocked"); await a.stop();
      const c = worker("start", id); await c.wait("blocked");
      const o = await db.$transaction(async tx => { await lockPaymentApplication(tx, "legacy", id); return paymentObligation(tx, "legacy", id, 3000000); });
      assert.equal(o.state, stage === "authority-evidence" ? "PAYABLE" : "REQUESTING");
      assert.equal(trace.length - before, stage === "reserved" ? 0 : 1);
      assert.equal(await db.payment.count({ where: { applicationId: id } }), 1);
      console.log(`PASS two-process start, SIGKILL at ${stage}, fresh-process recovery: ${o.state}`);
    }
    for (const stage of ["capture-response", "capture-evidence"]) {
      const id = await app(); const start = worker("start", id); await start.wait("ready"); const before = trace.length;
      const a = worker("capture", id, stage); await a.wait(stage); const b = worker("settle", id); await b.wait(stage === "capture-evidence" ? "verified" : "unknown"); await a.stop();
      const c = worker("settle", id); await c.wait(stage === "capture-evidence" ? "already-settled" : "unknown");
      assert.equal(trace.length - before, 1);
      console.log(`PASS SIGKILL at ${stage}: one provider invocation; durable evidence decides recovery`);
    }
  } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); await db.$disconnect(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
