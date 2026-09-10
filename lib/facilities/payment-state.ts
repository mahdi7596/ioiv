import { FacilitiesPaymentStatus } from "@prisma/client";

const transitions: Record<FacilitiesPaymentStatus, readonly FacilitiesPaymentStatus[]> = {
  [FacilitiesPaymentStatus.INITIATED]: [FacilitiesPaymentStatus.REDIRECT_READY, FacilitiesPaymentStatus.PENDING, FacilitiesPaymentStatus.FAILED, FacilitiesPaymentStatus.CANCELLED, FacilitiesPaymentStatus.TIMED_OUT],
  [FacilitiesPaymentStatus.REDIRECT_READY]: [FacilitiesPaymentStatus.PENDING, FacilitiesPaymentStatus.VERIFIED, FacilitiesPaymentStatus.FAILED, FacilitiesPaymentStatus.CANCELLED, FacilitiesPaymentStatus.TIMED_OUT],
  [FacilitiesPaymentStatus.PENDING]: [FacilitiesPaymentStatus.VERIFIED, FacilitiesPaymentStatus.FAILED, FacilitiesPaymentStatus.CANCELLED, FacilitiesPaymentStatus.TIMED_OUT],
  [FacilitiesPaymentStatus.TIMED_OUT]: [FacilitiesPaymentStatus.VERIFIED],
  [FacilitiesPaymentStatus.VERIFIED]: [],
  [FacilitiesPaymentStatus.FAILED]: [],
  [FacilitiesPaymentStatus.CANCELLED]: [],
};

export function isLegalFacilitiesPaymentTransition(from: FacilitiesPaymentStatus, to: FacilitiesPaymentStatus) {
  return from === to || transitions[from].includes(to);
}

export function hasPinnedPaymentAmount(input: { amountToman: number; paymentEnabledSnapshot: boolean; paymentAmountTomanSnapshot: number | null }) {
  return input.paymentEnabledSnapshot && input.paymentAmountTomanSnapshot !== null && input.paymentAmountTomanSnapshot > 0 && input.amountToman === input.paymentAmountTomanSnapshot;
}
