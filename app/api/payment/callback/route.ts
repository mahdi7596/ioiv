import { ApplicationStatus, PaymentStatus, Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyZarinpalPayment } from "@/lib/payments/zarinpal";
import { PAYMENT_AMOUNT_TOMAN } from "@/lib/validations/shared";
import { notifyAdminOfSubmission, notifyUserOfSubmission } from "@/lib/actions/payment";
import { logger } from "@/lib/logger";

type PaymentWithApplication = Prisma.PaymentGetPayload<{
  include: { application: { include: { payments: true } } };
}>;

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
    logger.info("payment_callback_already_verified", {
      paymentId: payment.id,
      applicationId: payment.applicationId,
    });
    redirect(createReturnUrl("success", payment.id));
  }

  if (status !== "OK") {
    logger.warn("payment_callback_rejected", {
      paymentId,
      status,
      reason: "callback_not_ok",
    });
    await markActivePaymentFailed(payment, {
      status,
      reason: "callback_not_ok",
    });
    redirect(createReturnUrl("failed", payment.id));
  }

  try {
    logger.info("payment_verification_started", {
      paymentId: payment.id,
      applicationId: payment.applicationId,
    });

    const verified = await verifyZarinpalPayment({
      amountToman: PAYMENT_AMOUNT_TOMAN,
      authority,
    });

    await db.$transaction([
      db.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.VERIFIED,
          referenceId: verified.referenceId,
          rawData: verified,
        },
      }),
      db.application.update({
        where: { id: payment.applicationId },
        data: {
          status: ApplicationStatus.SUBMITTED,
          submittedAt: new Date(),
        },
      }),
      db.statusHistory.create({
        data: {
          applicationId: payment.applicationId,
          previousStatus: payment.application.status,
          newStatus: ApplicationStatus.SUBMITTED,
          note: "پرداخت موفق بود و پرونده در صف بررسی قرار گرفت",
        },
      }),
    ]);
    logger.info("payment_verification_succeeded", {
      paymentId: payment.id,
      applicationId: payment.applicationId,
      referenceId: verified.referenceId,
    });
  } catch (error) {
    logger.error("payment_verification_failed", error, {
      paymentId: payment.id,
      applicationId: payment.applicationId,
    });
    await markActivePaymentFailed(payment, {
      error: error instanceof Error ? error.message : "verify failed",
    });
    redirect(createReturnUrl("failed", payment.id));
  }

  try {
    await Promise.all([
      notifyAdminOfSubmission(payment.applicationId),
      notifyUserOfSubmission(payment.application.mobile, payment.applicationId),
    ]);
  } catch (error) {
    logger.error("payment_notification_failed", error, {
      paymentId: payment.id,
      applicationId: payment.applicationId,
    });
  }

  redirect(createReturnUrl("success", payment.id));
}

function createReturnUrl(status: "success" | "failed", paymentId: string | null) {
  const params = new URLSearchParams({ status });

  if (paymentId) {
    params.set("paymentId", paymentId);
  }

  return `/payment/return?${params.toString()}`;
}

async function markActivePaymentFailed(
  payment: PaymentWithApplication,
  rawData: Prisma.InputJsonObject,
) {
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

function isActivePendingPayment(payment: PaymentWithApplication) {
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
