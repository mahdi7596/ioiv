import { describe, expect, it } from "vitest";
import { deriveFacilitiesPaymentNotice } from "@/lib/facilities/payment-notice";

const app = (status: string, ...payments: string[]) => ({ status, payments: payments.map((value) => ({ status: value })) });

describe("deriveFacilitiesPaymentNotice", () => {
  it("shows success only when a verified payment produced a submitted application", () => {
    expect(deriveFacilitiesPaymentNotice("success", app("SUBMITTED", "VERIFIED"))).toBe("success");
    expect(deriveFacilitiesPaymentNotice("success", app("UNDER_REVIEW", "FAILED", "VERIFIED"))).toBe("success");
  });

  it("ignores a forged success hint", () => {
    expect(deriveFacilitiesPaymentNotice("success", app("DRAFT"))).toBeUndefined();
    expect(deriveFacilitiesPaymentNotice("success", app("PENDING_PAYMENT", "REDIRECT_READY"))).toBeUndefined();
    expect(deriveFacilitiesPaymentNotice("success", app("SUBMITTED"))).toBeUndefined();
    expect(deriveFacilitiesPaymentNotice("success", undefined)).toBeUndefined();
  });

  it("flags a verified payment whose submission did not complete, regardless of the hint", () => {
    expect(deriveFacilitiesPaymentNotice("success", app("PENDING_PAYMENT", "VERIFIED"))).toBe("paid-unsubmitted");
    expect(deriveFacilitiesPaymentNotice(undefined, app("DRAFT", "VERIFIED"))).toBe("paid-unsubmitted");
    expect(deriveFacilitiesPaymentNotice("failed", app("PENDING_PAYMENT", "VERIFIED"))).toBe("paid-unsubmitted");
  });

  it("shows pending only while an attempt is open", () => {
    expect(deriveFacilitiesPaymentNotice("pending", app("PENDING_PAYMENT", "REDIRECT_READY"))).toBe("pending");
    expect(deriveFacilitiesPaymentNotice("pending", app("PENDING_PAYMENT", "TIMED_OUT"))).toBe("pending");
    expect(deriveFacilitiesPaymentNotice("pending", app("DRAFT", "FAILED"))).toBeUndefined();
  });

  it("passes the failed hint through and ignores unknown hints", () => {
    expect(deriveFacilitiesPaymentNotice("failed", app("DRAFT", "FAILED"))).toBe("failed");
    expect(deriveFacilitiesPaymentNotice("failed", undefined)).toBe("failed");
    expect(deriveFacilitiesPaymentNotice("anything", app("DRAFT"))).toBeUndefined();
  });
});
