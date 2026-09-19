import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { SignJWT } from "jose";
import { db } from "../../../lib/db";
// Browser tool dependency is supplied by the isolated runner, never added to app dependencies.
async function main() {
  assert.equal(process.env.PHASE1_ISOLATED_DB, "true");
  const { chromium } = await import(process.env.PHASE1_PLAYWRIGHT!);
  const id = `browser-${Date.now()}`;
  const file = { fileId: "synthetic-file", name: "fixture.pdf" };
  const user = await db.user.create({ data: { id, mobile: `099${Date.now().toString().slice(-8)}`, companyNationalId: Date.now().toString().slice(-11), companyName: "شرکت آزمایشی", companyContactFullName: "کاربر آزمایشی" } });
  const app = await db.application.create({ data: { userId: user.id, mobile: user.mobile, companyNationalId: user.companyNationalId!, currentStep: 6, status: "PENDING_PAYMENT", taxDeclarations: [{ year: "1402", file }], financials: [{ year: "1402", file }], humanResources: { employeeCount: 1, insuranceList: file }, trialBalance: { generalLedger: file, subsidiaryLedger: file }, creditReports: { company: file, ceo: file, boardMember: file } } });
  const payment = await db.payment.create({ data: { applicationId: app.id, amountToman: 3000000 } });
  const obligation = await db.paymentObligation.create({ data: { legacyApplicationId: app.id, legacyPaymentId: payment.id, amountToman: 3000000, state: "UNCERTAIN", operation: "REQUEST", generation: 1, owner: "fixture-owner", reason: "REQUEST_UNRESOLVED" } });
  const token = await new SignJWT({ subjectId: user.id, kind: "user" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30m").sign(new TextEncoder().encode(process.env.SESSION_SECRET));
  const browser = await chromium.launch({ headless: true });
  const screenshots = process.env.PHASE1_SCREENSHOTS!; await mkdir(screenshots, { recursive: true });
  const report: string[] = [];
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.route("**/*", (route: { request: () => { url: () => string }; continue: () => Promise<void>; abort: () => Promise<void>; fulfill: (v: { status: number; body: string }) => Promise<void> }) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
      await context.addCookies([{ name: "sana_session", value: token, url: "http://127.0.0.1:3199", httpOnly: true, sameSite: "Lax" }]);
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:3199/dashboard/application");
      await page.getByRole("button", { name: "بررسی وضعیت پرداخت", exact: true }).waitFor();
      assert.ok(await page.getByText("نتیجه پرداخت شما هنوز مشخص نشده است.", { exact: false }).count());
      await page.getByRole("button", { name: "بررسی وضعیت پرداخت", exact: true }).click();
      await page.getByRole("button", { name: "بررسی وضعیت پرداخت", exact: true }).waitFor({ state: "visible" });
      assert.equal(await db.payment.count({ where: { applicationId: app.id } }), 1);
      await page.screenshot({ path: `${screenshots}/uncertain-${width}.png`, fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      await page.reload();
      assert.ok(await page.getByRole("button", { name: "بررسی وضعیت پرداخت", exact: true }).count());
      await page.goto(`http://127.0.0.1:3199/payment/return?paymentId=${payment.id}&status=success`);
      await page.getByRole("heading", { name: "وضعیت پرداخت هنوز مشخص نیست", exact: true }).waitFor();
      await page.screenshot({ path: `${screenshots}/return-${width}.png` });
      report.push(`PASS ${width}px RTL uncertain state, check action, refresh, forged-success return, no horizontal overflow`);
      await context.close();
    }
    const context = await browser.newContext();
    await context.addCookies([{ name: "sana_session", value: token, url: "http://127.0.0.1:3199", httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    await db.payment.update({ where: { id: payment.id }, data: { authority: "fixture-payable" } });
    await db.paymentObligation.update({ where: { id: obligation.id }, data: { state: "PAYABLE" } });
    await page.route("**/pg/StartPay/**", (route: { request: () => { url: () => string }; continue: () => Promise<void>; abort: () => Promise<void>; fulfill: (v: { status: number; body: string }) => Promise<void> }) => route.fulfill({ status: 200, body: "Isolated redirect target; no external gateway contacted" }));
    await page.goto("http://127.0.0.1:3199/dashboard/application");
    await page.getByRole("button", { name: "ادامه پرداخت قبلی", exact: true }).click();
    await page.waitForURL("**/pg/StartPay/fixture-payable");
    assert.equal(await db.payment.count({ where: { applicationId: app.id } }), 1);
    report.push("PASS payable resumes exactly the saved authority (browser interception; no provider contact)");
    await context.clearCookies();
    await page.goto(`http://127.0.0.1:3199/payment/return?paymentId=${payment.id}&status=success`);
    await page.getByRole("heading", { name: "وضعیت پرداخت مشخص نیست", exact: true }).waitFor();
    report.push("PASS expired/signed-out session reveals no paid assertion");
    await context.close();
    console.log(report.join("\n"));
  } finally { await browser.close(); await db.$disconnect(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
