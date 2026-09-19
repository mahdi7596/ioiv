import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { SignJWT } from "jose";
import { db } from "../../../lib/db";

async function main() {
  assert.equal(process.env.PHASE1_ISOLATED_DB, "true");
  const url = new URL(process.env.DATABASE_URL!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.pathname, "/phase1"); assert.equal(url.username, "phase1_runtime");
  const base = process.env.APP_URL!; assert.equal(new URL(base).hostname, "127.0.0.1");
  const { chromium } = await import(process.env.PHASE1_PLAYWRIGHT!);
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const screenshots = process.env.PHASE1_SCREENSHOTS!; await mkdir(screenshots, { recursive: true });
  try {
    for (const width of [390, 1440]) {
      const id = randomUUID(); const file = { fileId: "synthetic-file", name: "fixture.pdf" };
      const user = await db.user.create({ data: { id, mobile: `099${Date.now().toString().slice(-8)}`, companyNationalId: Date.now().toString().slice(-11), companyName: "شرکت آزمایشی", companyContactFullName: "کاربر آزمایشی" } });
      const app = await db.application.create({ data: { userId: id, mobile: user.mobile, companyNationalId: user.companyNationalId!, currentStep: 6, status: "PENDING_PAYMENT", taxDeclarations: [{ year: "1402", file }], financials: [{ year: "1402", file }], humanResources: { employeeCount: 1, insuranceList: file }, trialBalance: { generalLedger: file, subsidiaryLedger: file }, creditReports: { company: file, ceo: file, boardMember: file } } });
      const payment = await db.payment.create({ data: { applicationId: app.id, amountToman: 3000000, authority: `fixture-${id}` } });
      const obligation = await db.paymentObligation.create({ data: { legacyApplicationId: app.id, legacyPaymentId: payment.id, amountToman: 3000000, state: "VERIFYING", operation: "VERIFY", generation: 1, owner: id } });
      // Synthetic durable provider capture; exercise real callback/local settlement, no external I/O.
      const token = await new SignJWT({ subjectId: id, kind: "user" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30m").sign(new TextEncoder().encode(process.env.SESSION_SECRET));
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.route("**/*", (route: { request: () => { url: () => string }; continue: () => Promise<void>; abort: () => Promise<void> }) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await context.addCookies([{ name: "sana_session", value: token, url: base, httpOnly: true, sameSite: "Lax" }]);
      const page = await context.newPage();
      const callback = `${base}/api/payment/callback?paymentId=${payment.id}&Authority=${payment.authority}&Status=NOK`;
      await page.goto(callback);
      await page.getByRole("heading", { name: "وضعیت پرداخت هنوز مشخص نیست", exact: true }).waitFor();
      await page.reload(); await page.getByRole("heading", { name: "وضعیت پرداخت هنوز مشخص نیست", exact: true }).waitFor();
      assert.ok(await page.getByText("نتیجه پرداخت شما هنوز مشخص نشده است.", { exact: false }).count());
      assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status, "INITIATED");
      assert.equal((await db.application.findUniqueOrThrow({ where: { id: app.id } })).status, "PENDING_PAYMENT");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      await page.screenshot({ path: `${screenshots}/cancel-pending-${width}.png`, fullPage: true });
      await db.paymentOperationResult.create({ data: { obligationId: obligation.id, generation: 1, owner: id, operation: "VERIFY", outcome: "CAPTURED", authority: payment.authority!, referenceId: `reference-${id}` } });
      await page.goto(callback);
      await page.getByRole("heading", { name: "پرداخت با موفقیت ثبت شد", exact: true }).waitFor();
      assert.ok(await page.getByText("وضعیت فعلی پرونده را در داشبورد ببینید", { exact: false }).count());
      assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status, "VERIFIED");
      const submitted = await db.application.findUniqueOrThrow({ where: { id: app.id } }); assert.equal(submitted.status, "SUBMITTED");
      await db.application.update({ where: { id: app.id }, data: { status: "UNDER_REVIEW", adminNote: "یادداشت آزمایشی محفوظ" } });
      await page.goto(callback); await page.getByRole("heading", { name: "پرداخت با موفقیت ثبت شد", exact: true }).waitFor();
      await page.reload(); await page.getByRole("heading", { name: "پرداخت با موفقیت ثبت شد", exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      await page.screenshot({ path: `${screenshots}/verified-review-${width}.png`, fullPage: true });
      const reviewed = await db.application.findUniqueOrThrow({ where: { id: app.id } }); assert.equal(reviewed.status, "UNDER_REVIEW"); assert.equal(reviewed.submittedAt?.toISOString(), submitted.submittedAt?.toISOString());
      await db.application.update({ where: { id: app.id }, data: { status: "NEEDS_EDIT" } });
      await page.goto(callback); await page.getByRole("heading", { name: "پرداخت با موفقیت ثبت شد", exact: true }).waitFor();
      assert.equal((await db.application.findUniqueOrThrow({ where: { id: app.id } })).status, "NEEDS_EDIT");
      await page.goto(`${base}/dashboard/application`);
      await page.getByRole("button", { name: "ارسال اصلاحات", exact: true }).click();
      // Synthetic legacy fixture intentionally has no complete facilities company profile.
      // Dashboard may immediately route it to that existing profile requirement.
      await page.waitForURL((url: URL) => url.pathname === "/dashboard" || url.pathname === "/dashboard/facilities-profile");
      assert.equal((await db.application.findUniqueOrThrow({ where: { id: app.id } })).status, "SUBMITTED");
      assert.equal(await db.statusHistory.count({ where: { applicationId: app.id, previousStatus: "NEEDS_EDIT" } }), 1);
      assert.equal(await db.payment.count({ where: { applicationId: app.id } }), 1);
      assert.equal(await db.paymentNotificationIntent.count({ where: { obligationId: obligation.id } }), 1);
      console.log(`PASS ${width}px: NOK uncertainty/refresh then durable capture replay, repeat/refresh preserves review/correction state, real correction button commits one history without repayment, RTL return no overflow`);
      await context.clearCookies(); await page.goto(`${base}/payment/return?paymentId=${payment.id}&status=success`);
      await page.getByRole("heading", { name: "وضعیت پرداخت مشخص نیست", exact: true }).waitFor();
      await context.close();
    }
    console.log("PASS signed-out return discloses no payment confirmation; external browser requests blocked");
  } finally { await browser.close(); await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
