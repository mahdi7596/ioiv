import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), paymentFindUnique: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/db", () => ({ db: { payment: { findUnique: mocks.paymentFindUnique } } }));

import PaymentReturnPage from "@/app/payment/return/page";

async function render(params: { status?: string; paymentId?: string }) {
  return renderToStaticMarkup(await PaymentReturnPage({ searchParams: Promise.resolve(params) }));
}

describe("payment return page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ kind: "user", subjectId: "user-1" });
    mocks.paymentFindUnique.mockResolvedValue({ status: "VERIFIED", application: { userId: "user-1" } });
  });

  it("renders a success message and dashboard redirect for the owner's verified payment", async () => {
    const markup = await render({ status: "success", paymentId: "pay_1" });

    expect(mocks.paymentFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "pay_1" } }));
    expect(markup).toContain("پرداخت با موفقیت ثبت شد");
    expect(markup).toContain("پرونده شما در صف بررسی قرار گرفت");
    expect(markup).toContain("http-equiv=\"refresh\"");
    expect(markup).toContain("url=/dashboard");
  });

  it("renders a failure message without creating a new persisted status", async () => {
    mocks.paymentFindUnique.mockResolvedValue({ status: "FAILED", application: { userId: "user-1" } });

    const markup = await render({ status: "failed", paymentId: "pay_1" });

    expect(markup).toContain("پرداخت ناموفق بود");
    expect(markup).toContain("می‌توانید دوباره پرداخت را انجام دهید");
    expect(markup).not.toContain("PAYMENT_RETURNED");
  });

  it("does not trust a success status in the URL when the payment is not verified", async () => {
    mocks.paymentFindUnique.mockResolvedValue({ status: "INITIATED", application: { userId: "user-1" } });

    const markup = await render({ status: "success", paymentId: "pay_1" });

    expect(markup).toContain("پرداخت ناموفق بود");
    expect(markup).not.toContain("پرداخت با موفقیت ثبت شد");
  });

  it("shows a neutral state for another user's payment or when signed out", async () => {
    mocks.paymentFindUnique.mockResolvedValue({ status: "VERIFIED", application: { userId: "user-2" } });
    expect(await render({ status: "success", paymentId: "pay_1" })).toContain("وضعیت پرداخت مشخص نیست");

    mocks.getSession.mockResolvedValue(null);
    const markup = await render({ status: "success", paymentId: "pay_1" });
    expect(markup).toContain("وضعیت پرداخت مشخص نیست");
    expect(markup).not.toContain("پرداخت با موفقیت ثبت شد");
  });

  it("shows the neutral state without a payment id and never queries the database", async () => {
    const markup = await render({ status: "success" });

    expect(markup).toContain("وضعیت پرداخت مشخص نیست");
    expect(mocks.paymentFindUnique).not.toHaveBeenCalled();
  });
});
