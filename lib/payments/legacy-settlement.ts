import { ApplicationStatus, PaymentStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { verifyZarinpalPayment } from "@/lib/payments/zarinpal";
import { beginPaymentVerification, lockPaymentApplication, markPaymentUncertain, savePaymentResult } from "@/lib/payments/coordination";
import { qualifyLegacyDocuments } from "@/lib/uploads/qualification";
import { DocumentQualificationError } from "@/lib/files/qualification";
import { isZarinpalRejection } from "@/lib/payments/zarinpal-errors";

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

  const reservation = await beginPaymentVerification("legacy", payment.applicationId, payment.id, payment.amountToman, authority).catch(() => null);
  if (!reservation) return "unknown";
  if (reservation.kind === "settled") {
    if (reservation.obligation.legacyPaymentId !== payment.id) return "duplicate";
    await completeVerifiedLegacySubmission(payment.applicationId);
    return "already-settled";
  }
  if (reservation.kind === "pending") return "unknown";
  let verified: { referenceId: string };
  if (reservation.kind === "captured") verified = { referenceId: reservation.referenceId };
  else {
    try {
      verified = await verifyZarinpalPayment({ amountToman: reservation.obligation.amountToman, authority });
    } catch (error) {
      await savePaymentResult(reservation.claim, isZarinpalRejection(error) ? "REJECTED" : "UNKNOWN", { authority }).catch(() => undefined);
      await markPaymentUncertain(reservation.claim, "VERIFY_UNRESOLVED").catch(() => undefined);
      return "unknown";
    }
    try {
      await savePaymentResult(reservation.claim, "CAPTURED", { authority, referenceId: verified.referenceId });
    } catch (error) {
      logger.error("payment_capture_evidence_persist_failed", error, context);
      return "persist-failed";
    }
  }

  let claimed: boolean;
  try {
    claimed = await db.$transaction(async (tx) => {
      await lockPaymentApplication(tx, "legacy", payment.applicationId);
      const obligation = await tx.paymentObligation.findUniqueOrThrow({ where: { id: reservation.obligation.id } });
      if (obligation.state === "SETTLED") return false;
      // Remote ownership and durable capture evidence precede this local commit.
      // Concurrent replay may finish the same capture, but only one writes history.
      const claim = await tx.payment.updateMany({
        where: { id: payment.id, status: { not: PaymentStatus.VERIFIED } },
        data: {
          status: PaymentStatus.VERIFIED,
          referenceId: verified.referenceId,
          rawData: verified,
        },
      });
      if (claim.count === 0) return false;
      await tx.paymentObligation.update({ where: { id: obligation.id }, data: { state: "SETTLED", reason: null } });
      return true;
    });
  } catch (error) {
    logger.error("payment_verification_persist_failed", error, { ...context, referenceId: verified.referenceId });
    return "persist-failed";
  }

  await completeVerifiedLegacySubmission(payment.applicationId);

  if (!claimed) {
    logger.info("payment_verification_already_settled", { ...context, referenceId: verified.referenceId });
    return "already-settled";
  }

  logger.info("payment_verification_succeeded", { ...context, referenceId: verified.referenceId });
  return "verified";
}

/** Money is committed first. Qualification failure cannot erase a captured payment. */
export async function completeVerifiedLegacySubmission(applicationId: string): Promise<void> {
  try {
    await db.$transaction(async tx => {
      await lockPaymentApplication(tx, "legacy", applicationId);
      const application = await tx.application.findUniqueOrThrow({ where: { id: applicationId } });
      if (application.status !== ApplicationStatus.DRAFT && application.status !== ApplicationStatus.PENDING_PAYMENT) return;
      const payment = await tx.payment.findFirst({ where: { applicationId, status: PaymentStatus.VERIFIED } });
      if (!payment) return;
      try { await qualifyLegacyDocuments(tx, applicationId, application); }
      catch (error) {
        if (!(error instanceof DocumentQualificationError)) throw error;
        if (application.status === ApplicationStatus.PENDING_PAYMENT) {
          await tx.application.update({ where: { id: applicationId }, data: { status: ApplicationStatus.DRAFT } });
          await tx.statusHistory.create({ data: { applicationId, previousStatus: application.status, newStatus: ApplicationStatus.DRAFT, note: "پرداخت ثبت شد؛ مدارک را تکمیل و بدون پرداخت دوباره ارسال کنید" } });
        }
        return;
      }
      await tx.application.update({ where: { id: applicationId }, data: { status: ApplicationStatus.SUBMITTED, submittedAt: new Date() } });
      await tx.statusHistory.create({ data: { applicationId, previousStatus: application.status, newStatus: ApplicationStatus.SUBMITTED, note: "پرداخت موفق بود و پرونده در صف بررسی قرار گرفت" } });
      const obligation = await tx.paymentObligation.findUnique({ where: { legacyApplicationId: applicationId } });
      if (obligation) await tx.paymentNotificationIntent.upsert({ where: { obligationId: obligation.id }, create: { obligationId: obligation.id }, update: {} });
    });
  } catch (error) {
    logger.error("legacy_paid_submission_retry_required", error, { applicationId });
  }
}
