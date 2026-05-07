import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PaymentReturnPage from "@/app/payment/return/page";

describe("payment return page", () => {
  it("renders a success message and dashboard redirect", async () => {
    const element = await PaymentReturnPage({
      searchParams: Promise.resolve({ status: "success", paymentId: "pay_1" }),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("پرداخت با موفقیت ثبت شد");
    expect(markup).toContain("پرونده شما در صف بررسی قرار گرفت");
    expect(markup).toContain("http-equiv=\"refresh\"");
    expect(markup).toContain("url=/dashboard");
  });

  it("renders a failure message without creating a new persisted status", async () => {
    const element = await PaymentReturnPage({
      searchParams: Promise.resolve({ status: "failed", paymentId: "pay_1" }),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("پرداخت ناموفق بود");
    expect(markup).toContain("می‌توانید دوباره پرداخت را انجام دهید");
    expect(markup).not.toContain("PAYMENT_RETURNED");
  });
});
