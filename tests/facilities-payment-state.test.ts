import { FacilitiesPaymentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { hasPinnedPaymentAmount, isLegalFacilitiesPaymentTransition } from "@/lib/facilities/payment-state";

describe("facilities payment state machine", () => {
  it("allows the intended gateway lifecycle and delayed verification after timeout", () => {
    expect(isLegalFacilitiesPaymentTransition(FacilitiesPaymentStatus.INITIATED, FacilitiesPaymentStatus.REDIRECT_READY)).toBe(true);
    expect(isLegalFacilitiesPaymentTransition(FacilitiesPaymentStatus.REDIRECT_READY, FacilitiesPaymentStatus.PENDING)).toBe(true);
    expect(isLegalFacilitiesPaymentTransition(FacilitiesPaymentStatus.PENDING, FacilitiesPaymentStatus.VERIFIED)).toBe(true);
    expect(isLegalFacilitiesPaymentTransition(FacilitiesPaymentStatus.TIMED_OUT, FacilitiesPaymentStatus.VERIFIED)).toBe(true);
    expect(isLegalFacilitiesPaymentTransition(FacilitiesPaymentStatus.VERIFIED, FacilitiesPaymentStatus.FAILED)).toBe(false);
    expect(isLegalFacilitiesPaymentTransition(FacilitiesPaymentStatus.CANCELLED, FacilitiesPaymentStatus.INITIATED)).toBe(false);
  });

  it("accepts only the server-pinned positive payment amount", () => {
    expect(hasPinnedPaymentAmount({ amountToman: 3000000, paymentEnabledSnapshot: true, paymentAmountTomanSnapshot: 3000000 })).toBe(true);
    expect(hasPinnedPaymentAmount({ amountToman: 1, paymentEnabledSnapshot: true, paymentAmountTomanSnapshot: 3000000 })).toBe(false);
    expect(hasPinnedPaymentAmount({ amountToman: 0, paymentEnabledSnapshot: false, paymentAmountTomanSnapshot: null })).toBe(false);
  });
});
