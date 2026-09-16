import { ApplicationStatus, PaymentStatus, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { verifyZarinpalPayment } from "@/lib/payments/zarinpal";
import { isZarinpalRejection } from "@/lib/payments/zarinpal-errors";

/**
 * Company-registration (legacy) payment settlement, shared by the gateway
 * callback and by `startPayment` when it finds an attempt that already reached
 * the gateway.
 *
 * Verification and persistence are deliberately separate steps with separate
 * outcomes:
 *
 * - `rejected`: Zarinpal explicitly refused the authority. No money moved, the
 *   attempt is marked FAILED and the application returns to draft.
 * - `unknown`: the gateway gave no trustworthy answer. Nothing is written; the
 *   row keeps its authority and is re-verified on the next callback or retry.
 * - `persist-failed`: Zarinpal confirmed the capture but the database write
 *   failed. The row is left untouched so the confirmed authority is re-verified
 *   (Zarinpal answers "already verified") and persisted on the next attempt. It
 *   must never be marked FAILED: that would invite a second charge.
 * - `verified`: money captured and the application moved to SUBMITTED.
 * - `already-settled`: a concurrent settlement of the same row (duplicate
 *   callback delivery) won the row lock; nothing more to record or notify.
 * - `duplicate`: the application already holds a different verified payment.
 *   This attempt is closed without verifying it, so the gateway reverses the
 *   capture instead of the merchant owing a manual refund.
 */
export type LegacySettlementOutcome = "verified" | "rejected" | "unknown" | "persist-failed" | "already-settled" | "duplicate";

export type LegacyPaymentForSettlement = {
  id: string;
  applicationId: string;
  amountToman: number;
  authority: string | null;
  status: PaymentStatus;
  application: {
    status: ApplicationStatus;
    payments?: Array<{ id: string; status: PaymentStatus }> | null;
  };
};

export async function settleLegacyPayment(payment: LegacyPaymentForSettlement, authority: string): Promise<LegacySettlementOutcome> {
  const context = { paymentId: payment.id, applicationId: payment.applicationId };

  const otherVerified = (payment.application.payments ?? []).find(
    (candidate) => candidate.id !== payment.id && candidate.status === PaymentStatus.VERIFIED,
  );
  if (otherVerified) {
    logger.warn("payment_duplicate_capture_declined", { ...context, verifiedPaymentId: otherVerified.id });
    await markLegacyPaymentFailed(payment, { reason: "duplicate_payment_not_verified", verifiedPaymentId: otherVerified.id });
    return "duplicate";
  }

  logger.info("payment_verification_started", context);

  let verified: { referenceId: string };
  try {
    verified = await verifyZarinpalPayment({ amountToman: payment.amountToman, authority });
  } catch (error) {
    if (isZarinpalRejection(error)) {
      logger.warn("payment_verification_rejected", { ...context, code: error.code });
      await markLegacyPaymentFailed(payment, { error: error.message });
      return "rejected";
    }
    logger.error("payment_verification_unavailable", error, context);
    return "unknown";
  }

  let claimed: boolean;
  try {
    claimed = await db.$transaction(async (tx) => {
      // Duplicate deliveries of the same callback both verify (Zarinpal answers
      // "already verified" the second time); only the caller that flips the row
      // to VERIFIED writes history and sends notifications. The conditional
      // update takes the row lock and re-checks the status under it.
      const claim = await tx.payment.updateMany({
        where: { id: payment.id, status: { not: PaymentStatus.VERIFIED } },
        data: {
          status: PaymentStatus.VERIFIED,
          referenceId: verified.referenceId,
          rawData: verified,
        },
      });
      if (claim.count === 0) return false;
      await tx.application.update({
        where: { id: payment.applicationId },
        data: {
          status: ApplicationStatus.SUBMITTED,
          submittedAt: new Date(),
        },
      });
      await tx.statusHistory.create({
        data: {
          applicationId: payment.applicationId,
          previousStatus: payment.application.status,
          newStatus: ApplicationStatus.SUBMITTED,
          note: "پرداخت موفق بود و پرونده در صف بررسی قرار گرفت",
        },
      });
      return true;
    });
  } catch (error) {
    logger.error("payment_verification_persist_failed", error, { ...context, referenceId: verified.referenceId });
    return "persist-failed";
  }

  if (!claimed) {
    logger.info("payment_verification_already_settled", { ...context, referenceId: verified.referenceId });
    return "already-settled";
  }

  logger.info("payment_verification_succeeded", { ...context, referenceId: verified.referenceId });
  return "verified";
}

/**
 * Close an attempt that the gateway rejected or the user cancelled. Only an
 * INITIATED row is touched, and the application only returns to draft when this
 * was its sole open attempt and nothing has been verified.
 */
export async function markLegacyPaymentFailed(payment: LegacyPaymentForSettlement, rawData: Prisma.InputJsonObject) {
  if (payment.status !== PaymentStatus.INITIATED) {
    return;
  }

  const operations: Prisma.PrismaPromise<unknown>[] = [
    db.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        rawData,
      },
    }),
  ];

  if (isActivePendingPayment(payment)) {
    operations.push(
      db.application.update({
        where: { id: payment.applicationId },
        data: { status: ApplicationStatus.DRAFT },
      }),
    );
  }

  await db.$transaction(operations);
}

function isActivePendingPayment(payment: LegacyPaymentForSettlement) {
  if (payment.application.status !== ApplicationStatus.PENDING_PAYMENT) {
    return false;
  }

  const relatedPayments = payment.application.payments || [];
  const hasVerifiedPayment = relatedPayments.some(
    (candidate) => candidate.status === PaymentStatus.VERIFIED,
  );
  const hasNewerInitiatedPayment = relatedPayments.some(
    (candidate) =>
      candidate.id !== payment.id && candidate.status === PaymentStatus.INITIATED,
  );

  return !hasVerifiedPayment && !hasNewerInitiatedPayment;
}
