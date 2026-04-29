import { ApplicationStatus, PaymentStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyZarinpalPayment } from "@/lib/payments/zarinpal";
import { PAYMENT_AMOUNT_TOMAN } from "@/lib/validations/shared";
import { notifyAdminOfSubmission } from "@/lib/actions/payment";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const paymentId = url.searchParams.get("paymentId");
  const authority = url.searchParams.get("Authority");
  const status = url.searchParams.get("Status");

  if (!paymentId || !authority || status !== "OK") {
    logger.warn("payment_callback_rejected", {
      paymentId,
      status,
      reason: "missing_or_not_ok",
    });
    redirect("/dashboard?payment=failed");
  }

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { application: true },
  });

  if (!payment || payment.authority !== authority) {
    logger.warn("payment_callback_rejected", {
      paymentId,
      reason: "payment_not_found_or_authority_mismatch",
    });
    redirect("/dashboard?payment=failed");
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

    await notifyAdminOfSubmission(payment.applicationId);
    logger.info("payment_verification_succeeded", {
      paymentId: payment.id,
      applicationId: payment.applicationId,
      referenceId: verified.referenceId,
    });
    redirect("/dashboard?payment=verified");
  } catch (error) {
    logger.error("payment_verification_failed", error, {
      paymentId: payment.id,
      applicationId: payment.applicationId,
    });
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        rawData: { error: error instanceof Error ? error.message : "verify failed" },
      },
    });
    await db.application.update({
      where: { id: payment.applicationId },
      data: { status: ApplicationStatus.DRAFT },
    });
    redirect("/dashboard?payment=failed");
  }
}
