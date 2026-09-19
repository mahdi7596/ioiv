import { db } from "../../../lib/db";
import { lockPaymentApplication, paymentObligation, claimPaymentOperation, savePaymentResult, finishPaymentRequest, beginPaymentVerification } from "../../../lib/payments/coordination";
import { settleLegacyPayment } from "../../../lib/payments/legacy-settlement";
import { requestZarinpalPayment, verifyZarinpalPayment } from "../../../lib/payments/zarinpal";
const [mode, appId, stopAt] = process.argv.slice(2);
async function checkpoint(stage: string) { process.send?.({ stage }); if (stage === stopAt) await new Promise<void>(r => process.once("message", () => r())); }
const nativeFetch = fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.hostname !== "sandbox.zarinpal.com") throw new Error("unexpected external destination");
  const fixture = new URL(process.env.PHASE1_PROVIDER_URL!);
  if (fixture.hostname !== "127.0.0.1") throw new Error("non-loopback fixture");
  return nativeFetch(`${fixture.origin}${url.pathname}`, init);
};
async function main() {
  if (process.env.PHASE1_ISOLATED_DB !== "true" || new URL(process.env.DATABASE_URL!).pathname !== "/phase1") throw new Error("unsafe environment");
  if (mode === "start") {
    const r = await db.$transaction(async tx => {
      await lockPaymentApplication(tx, "legacy", appId);
      const o = await paymentObligation(tx, "legacy", appId, 3000000);
      if (o.state !== "READY") return null;
      const p = await tx.payment.create({ data: { applicationId: appId, amountToman: 3000000 } });
      return { p, claim: await claimPaymentOperation(tx, o, "REQUEST", p.id) };
    });
    if (!r) return checkpoint("blocked");
    await checkpoint("reserved");
    const result = await requestZarinpalPayment({ amountToman: 3000000, description: "fixture", callbackUrl: "http://127.0.0.1/fixture", mobile: "fixture" });
    await checkpoint("request-response");
    await savePaymentResult(r.claim, "AUTHORITY", { authority: result.authority });
    await checkpoint("authority-evidence");
    await finishPaymentRequest(r.claim, "legacy", appId, r.p.id, result.authority, async tx => { await tx.payment.update({ where: { id: r.p.id }, data: { authority: result.authority } }); });
    await checkpoint("ready");
  } else {
    const p = await db.payment.findFirstOrThrow({ where: { applicationId: appId }, include: { application: { include: { payments: true } } } });
    if (mode === "capture") {
      const r = await beginPaymentVerification("legacy", appId, p.id, p.amountToman, p.authority!);
      if (r.kind !== "claimed") return checkpoint("blocked");
      const result = await verifyZarinpalPayment({ amountToman: p.amountToman, authority: p.authority! });
      await checkpoint("capture-response");
      await savePaymentResult(r.claim, "CAPTURED", { authority: p.authority!, referenceId: result.referenceId });
      await checkpoint("capture-evidence");
    }
    await checkpoint(await settleLegacyPayment(p, p.authority!));
  }
}
main().catch(error => { process.send?.({ error: error.message }); process.exitCode = 1; }).finally(async () => { await db.$disconnect(); process.disconnect?.(); });
