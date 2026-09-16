import { FacilitiesPaymentStatus } from "@prisma/client";

const transitions: Record<FacilitiesPaymentStatus, readonly FacilitiesPaymentStatus[]> = {
  [FacilitiesPaymentStatus.INITIATED]: [FacilitiesPaymentStatus.REDIRECT_READY, FacilitiesPaymentStatus.PENDING, FacilitiesPaymentStatus.FAILED, FacilitiesPaymentStatus.CANCELLED, FacilitiesPaymentStatus.TIMED_OUT],
  [FacilitiesPaymentStatus.REDIRECT_READY]: [FacilitiesPaymentStatus.PENDING, FacilitiesPaymentStatus.VERIFIED, FacilitiesPaymentStatus.FAILED, FacilitiesPaymentStatus.CANCELLED, FacilitiesPaymentStatus.TIMED_OUT],
  [FacilitiesPaymentStatus.PENDING]: [FacilitiesPaymentStatus.VERIFIED, FacilitiesPaymentStatus.FAILED, FacilitiesPaymentStatus.CANCELLED, FacilitiesPaymentStatus.TIMED_OUT],
  // A delayed callback can still verify a timed-out attempt; a stale attempt that
  // never reached the gateway is failed so the applicant can start over.
  [FacilitiesPaymentStatus.TIMED_OUT]: [FacilitiesPaymentStatus.VERIFIED, FacilitiesPaymentStatus.FAILED],
  [FacilitiesPaymentStatus.VERIFIED]: [],
  // Late capture: the gateway confirms an attempt that was closed while the
  // applicant was still on the bank page. Mirrors the database trigger
  // (migration 20260916150000_facilities_payment_late_capture).
  [FacilitiesPaymentStatus.FAILED]: [FacilitiesPaymentStatus.VERIFIED],
  [FacilitiesPaymentStatus.CANCELLED]: [FacilitiesPaymentStatus.VERIFIED],
};

export function isLegalFacilitiesPaymentTransition(from: FacilitiesPaymentStatus, to: FacilitiesPaymentStatus) {
  return from === to || transitions[from].includes(to);
}

export function hasPinnedPaymentAmount(input: { amountToman: number; paymentEnabledSnapshot: boolean; paymentAmountTomanSnapshot: number | null }) {
  return input.paymentEnabledSnapshot && input.paymentAmountTomanSnapshot !== null && input.paymentAmountTomanSnapshot > 0 && input.amountToman === input.paymentAmountTomanSnapshot;
}
