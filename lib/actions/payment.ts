"use server";

import { ApplicationStatus, PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { sendSms } from "@/lib/sms";
import { finalSubmissionSchema } from "@/lib/validations/application";
import { PAYMENT_AMOUNT_TOMAN } from "@/lib/validations/shared";
import { requestZarinpalPayment } from "@/lib/payments/zarinpal";
import { ActionError } from "./auth";

export async function startPayment() {
  const session = await requireSession("user");
  const application = await db.application.findFirst({
    where: { userId: session.subjectId },
    orderBy: { createdAt: "desc" },
    include: { payments: { where: { status: PaymentStatus.VERIFIED } } },
  });

  if (!application) {
    throw new ActionError("پرونده‌ای برای پرداخت پیدا نشد", 404);
  }

  const validation = finalSubmissionSchema.safeParse({
    taxDeclarations: application.taxDeclarations,
    financials: application.financials,
    trialBalance: application.trialBalance,
    creditReports: application.creditReports,
    acceptedTerms: true,
  });

  if (!validation.success) {
    throw new ActionError("مدارک الزامی پیش از پرداخت کامل نیست");
  }

  if (application.payments.length > 0 && application.status === ApplicationStatus.NEEDS_EDIT) {
    await db.application.update({
      where: { id: application.id },
      data: { status: ApplicationStatus.SUBMITTED },
    });
    return { redirectTo: "/dashboard" };
  }

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const payment = await db.payment.create({
    data: {
      applicationId: application.id,
      amountToman: PAYMENT_AMOUNT_TOMAN,
      status: PaymentStatus.INITIATED,
    },
  });

  const zarinpal = await requestZarinpalPayment({
    amountToman: PAYMENT_AMOUNT_TOMAN,
    description: "پرداخت ثبت پرونده سامانه ثنا",
    callbackUrl: `${appUrl}/api/payment/callback?paymentId=${payment.id}`,
    mobile: application.mobile,
  });

  await db.$transaction([
    db.application.update({
      where: { id: application.id },
      data: { status: ApplicationStatus.PENDING_PAYMENT },
    }),
    db.payment.update({
      where: { id: payment.id },
      data: { authority: zarinpal.authority },
    }),
  ]);

  return { redirectTo: zarinpal.paymentUrl };
}

export async function notifyAdminOfSubmission(applicationId: string) {
  const adminMobile = process.env.ADMIN_ALERT_MOBILE;

  if (!adminMobile) {
    return;
  }

  await sendSms({
    to: adminMobile,
    text: `پرونده جدید در سامانه ثنا ثبت شد: ${applicationId}`,
  });
}
