import { PaymentStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { dispatchSubmissionIntent } from "@/lib/payments/legacy-notifications";
import { completeVerifiedLegacySubmission, settleLegacyPayment } from "@/lib/payments/legacy-settlement";
import { logger } from "@/lib/logger";

type ReturnState = "success" | "failed" | "pending";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const paymentId = url.searchParams.get("paymentId");
  const authority = url.searchParams.get("Authority");
  const status = url.searchParams.get("Status");

  if (!paymentId || !authority) {
    logger.warn("payment_callback_rejected", {
      paymentId,
      status,
      reason: "missing_payment_or_authority",
    });
    redirect(createReturnUrl("failed", paymentId));
  }

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { application: { include: { payments: true } } },
  });

  if (!payment || payment.authority !== authority) {
    logger.warn("payment_callback_rejected", {
      paymentId,
      reason: "payment_not_found_or_authority_mismatch",
    });
    redirect(createReturnUrl("failed", paymentId));
  }

  if (payment.status === PaymentStatus.VERIFIED) {
    await completeVerifiedLegacySubmission(payment.applicationId);
    logger.info("payment_callback_already_verified", {
      paymentId: payment.id,
      applicationId: payment.applicationId,
    });
    await dispatchSubmissionIntent(payment.applicationId, payment.application.mobile);
    redirect(createReturnUrl("success", payment.id));
  }

  // Browser status (including cancellation) is not proof of nonpayment.
  // The selected authority is checked through the same durable coordinator.
  const outcome = await settleLegacyPayment(payment, authority);

  if (outcome === "rejected") {
    redirect(createReturnUrl("failed", payment.id));
  }

  if (outcome === "duplicate") {
    // The application is already paid. Preserve the other attempt for reconciliation;
    // declining verification is not evidence of refund or reversal.
    const verifiedPayment = payment.application.payments.find((candidate) => candidate.status === PaymentStatus.VERIFIED);
    redirect(createReturnUrl("success", verifiedPayment?.id ?? payment.id));
  }

  if (outcome === "already-settled") {
    // A concurrent delivery already wrote history and sent the notifications.
    await dispatchSubmissionIntent(payment.applicationId, payment.application.mobile);
    redirect(createReturnUrl("success", payment.id));
  }

  // "unknown": the gateway could not be trusted; "persist-failed": Zarinpal
  // confirmed the capture but the database write failed. In both cases the row
  // keeps its authority and is re-verified on the next retry or re-delivery, so
  // the applicant must never be told to pay again here.
  if (outcome !== "verified") {
    redirect(createReturnUrl("pending", payment.id));
  }

  try {
    await dispatchSubmissionIntent(payment.applicationId, payment.application.mobile);
  } catch (error) {
    logger.error("payment_notification_failed", error, {
      paymentId: payment.id,
      applicationId: payment.applicationId,
    });
  }

  redirect(createReturnUrl("success", payment.id));
}

function createReturnUrl(status: ReturnState, paymentId: string | null) {
  const params = new URLSearchParams({ status });

  if (paymentId) {
    params.set("paymentId", paymentId);
  }

  return `/payment/return?${params.toString()}`;
}
