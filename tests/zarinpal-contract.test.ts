import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestZarinpalPayment, verifyZarinpalPayment } from "@/lib/payments/zarinpal";
import { ZarinpalUnavailableError, ZarinpalRejectedError } from "@/lib/payments/zarinpal-errors";
const authority = `S${"0".repeat(28)}wwOGYpd`;
const input = { amountToman: 123456, authority };
const request = { amountToman: input.amountToman, description: "fixture", callbackUrl: "http://127.0.0.1/callback", mobile: "fixture" };
function answer(payload: unknown, status = 200) { const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status })); vi.stubGlobal("fetch", f); return f; }
beforeEach(() => { vi.stubEnv("ZARINPAL_SANDBOX", "true"); vi.stubEnv("ZARINPAL_MERCHANT_ID", "11111111-1111-1111-1111-111111111111"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("R12 gateway contract", () => {
  it.each([100, 101])("accepts documented verify code %s and exact stored amount/authority", async code => {
    const f = answer({ data: { code, ref_id: 201 }, errors: [] });
    await expect(verifyZarinpalPayment(input)).resolves.toEqual({ referenceId: "201" });
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ amount: 123456, currency: "IRT", authority });
  });
  it.each([undefined, null, "100", "101", 0, -51, 102, true])("unknown verify code %s cannot confirm a reference", async code => {
    answer({ data: { code, ref_id: 201 }, errors: [] });
    await expect(verifyZarinpalPayment(input)).rejects.toBeInstanceOf(ZarinpalUnavailableError);
  });
  it.each([undefined, null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "", "0", "201", " ", "ref", true, {}, []])("unusable reference %s stays unknown", async ref_id => {
    answer({ data: { code: 100, ref_id }, errors: [] });
    await expect(verifyZarinpalPayment(input)).rejects.toBeInstanceOf(ZarinpalUnavailableError);
  });
  it.each([
    null, [], "json", {}, { data: { code: 100, ref_id: 201 } },
    { data: { code: 100, ref_id: 201 }, errors: null },
    { data: { code: 100, ref_id: 201 }, errors: {} },
    { data: { code: 100, ref_id: 201 }, errors: { code: -51 } },
    { data: {}, errors: { code: "-51" } }, { data: [], errors: { code: -999 } },
    { data: [], errors: [{ code: -51 }] }, { data: [], errors: true },
    { errors: { code: -51 } }, { data: { ref_id: 201 }, errors: { code: -51 } },
    { data: { code: 100, ref_id: 201, authority: "different" }, errors: [] },
    { data: { code: 100, ref_id: 201, amount: 1 }, errors: [] },
    { data: { code: 100, ref_id: 201, currency: "IRR" }, errors: [] },
  ])("malformed or contradictory envelope %# stays unknown", async payload => {
    answer(payload); await expect(verifyZarinpalPayment(input)).rejects.toBeInstanceOf(ZarinpalUnavailableError);
  });
  it("recognizes complete explicit rejection without retaining provider text", async () => {
    answer({ data: [], errors: { code: -51, message: "secret-merchant", validations: { token: "secret-token" } } });
    const e = await verifyZarinpalPayment(input).catch(e => e);
    expect(e).toBeInstanceOf(ZarinpalRejectedError); expect(e.code).toBe(-51);
    expect(String(e)).not.toMatch(/secret/);
  });
  it.each([400, 500, 502, 503])("HTTP %s never confirms success", async status => {
    answer({ data: { code: 100, ref_id: 201 }, errors: [] }, status);
    await expect(verifyZarinpalPayment(input)).rejects.toBeInstanceOf(ZarinpalUnavailableError);
  });
  it("invalid JSON stays unknown", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>invalid")));
    await expect(verifyZarinpalPayment(input)).rejects.toBeInstanceOf(ZarinpalUnavailableError);
  });
  it("actual abort signal bounds a stalled verify without retry", async () => {
    vi.stubEnv("ZARINPAL_REQUEST_TIMEOUT_MS", "1000");
    const f = vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason))));
    vi.stubGlobal("fetch", f);
    await expect(verifyZarinpalPayment(input)).rejects.toMatchObject({ name: "TimeoutError" }); expect(f).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, 101, "100", -9])("request code %s cannot issue a payment URL", async code => {
    answer({ data: { code, authority }, errors: [] });
    await expect(requestZarinpalPayment(request)).rejects.toBeInstanceOf(ZarinpalUnavailableError);
  });
  it.each(["", " ", "S", `A${"0".repeat(35)}`, `S${"0".repeat(34)}`, `S${"0".repeat(36)}`, `S${"/".repeat(35)}`, `S${"?".repeat(35)}`, 201])("request authority %s is unusable", async value => {
    answer({ data: { code: 100, authority: value }, errors: [] });
    await expect(requestZarinpalPayment(request)).rejects.toBeInstanceOf(ZarinpalUnavailableError);
  });
  it("uses the documented mixed-case sandbox authority", async () => {
    answer({ data: { code: 100, authority }, errors: [] });
    await expect(requestZarinpalPayment(request)).resolves.toEqual({ authority, paymentUrl: `https://sandbox.zarinpal.com/pg/StartPay/${authority}` });
  });
  it("invalid outbound authority and amount never reach the provider", async () => {
    const f = answer({ data: { code: 100, ref_id: 201 }, errors: [] });
    await expect(verifyZarinpalPayment({ ...input, authority: "forged" })).rejects.toBeInstanceOf(ZarinpalUnavailableError);
    await expect(verifyZarinpalPayment({ ...input, amountToman: 0 })).rejects.toBeInstanceOf(ZarinpalUnavailableError);
    await expect(requestZarinpalPayment({ ...request, amountToman: 1.5 })).rejects.toBeInstanceOf(ZarinpalUnavailableError);
    expect(f).not.toHaveBeenCalled();
  });
});
