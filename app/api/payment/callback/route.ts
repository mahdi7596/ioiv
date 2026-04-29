import { ApplicationStatus, PaymentStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyZarinpalPayment } from "@/lib/payments/zarinpal";
import { PAYMENT_AMOUNT_TOMAN } from "@/lib/validations/shared";
import { notifyAdminOfSubmission } from "@/lib/actions/payment";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const paymentId = url.searchParams.get("paymentId");
  const authority = url.searchParams.get("Authority");
  const status = url.searchParams.get("Status");

  if (!paymentId || !authority || status !== "OK") {
    redirect("/dashboard?payment=failed");
  }

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { application: true },
  });

  if (!payment || payment.authority !== authority) {
    redirect("/dashboard?payment=failed");
  }

  try {
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
          note: "پرداخت تایید شد و پرونده ارسال شد",
        },
      }),
    ]);

    await notifyAdminOfSubmission(payment.applicationId);
    redirect("/dashboard?payment=verified");
  } catch (error) {
    console.error(error);
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
