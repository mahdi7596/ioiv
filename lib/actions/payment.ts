"use server";

import { ApplicationStatus, PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { sendSms } from "@/lib/sms";
import {
  createAdminSubmissionSmsMessage,
  createSubmissionReceivedSmsMessage,
} from "@/lib/sms/messages";
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
    humanResources: application.humanResources,
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
    logger.info("application_resubmitted_without_payment", {
      applicationId: application.id,
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

  logger.info("payment_start_requested", {
    applicationId: application.id,
    paymentId: payment.id,
    amountToman: PAYMENT_AMOUNT_TOMAN,
  });

  let zarinpal: { authority: string; paymentUrl: string };

  try {
    zarinpal = await requestZarinpalPayment({
      amountToman: PAYMENT_AMOUNT_TOMAN,
      description: "پرداخت ثبت پرونده سامانه اعتبار سنجی سانا",
      callbackUrl: `${appUrl}/api/payment/callback?paymentId=${payment.id}`,
      mobile: application.mobile,
    });
  } catch (error) {
    logger.error("payment_start_failed", error, {
      applicationId: application.id,
      paymentId: payment.id,
    });
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        rawData: { error: error instanceof Error ? error.message : "payment request failed" },
      },
    });
    throw error;
  }

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

  logger.info("payment_start_succeeded", {
    applicationId: application.id,
    paymentId: payment.id,
  });

  return { redirectTo: zarinpal.paymentUrl };
}

export async function notifyAdminOfSubmission(applicationId: string) {
  const adminMobile = process.env.ADMIN_ALERT_MOBILE;

  if (!adminMobile) {
    logger.warn("admin_submission_notification_skipped", {
      applicationId,
      reason: "missing_admin_alert_mobile",
    });
    return;
  }

  await sendSms(createAdminSubmissionSmsMessage(adminMobile, applicationId));
  logger.info("admin_submission_notification_sent", {
    applicationId,
  });
}

export async function notifyUserOfSubmission(mobile: string, applicationId: string) {
  await sendSms(createSubmissionReceivedSmsMessage(mobile));
  logger.info("user_submission_notification_sent", {
    applicationId,
  });
}
