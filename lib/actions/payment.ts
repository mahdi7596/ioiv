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
import { applicationDraftSchema, finalSubmissionSchema } from "@/lib/validations/application";

type PaymentStartResult =
  | { ok: true; redirectTo: string }
  | { ok: false; message: string };

const PAYMENT_VALIDATION_FAILED_MESSAGE = "مدارک الزامی پیش از پرداخت کامل نیست";
const PAYMENT_DISABLED_MESSAGE = "پرداخت برای پرونده‌های پرداخت‌نشده در حال حاضر غیرفعال است";

export async function startPayment(input: unknown): Promise<PaymentStartResult> {
  const session = await requireSession("user");
  const application = await db.application.findFirst({
    where: { userId: session.subjectId },
    orderBy: { createdAt: "desc" },
    include: {
      payments: {
        where: { status: { in: [PaymentStatus.INITIATED, PaymentStatus.VERIFIED] } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!application) {
    return { ok: false, message: "پرونده‌ای برای پرداخت پیدا نشد" };
  }

  const draft = applicationDraftSchema.safeParse(input);

  if (!draft.success) {
    return {
      ok: false,
      message: draft.error.issues[0]?.message || PAYMENT_VALIDATION_FAILED_MESSAGE,
    };
  }

  const draftData = draft.data;
  const validation = finalSubmissionSchema.safeParse({
    taxDeclarations: draftData.taxDeclarations,
    financials: draftData.financials,
    humanResources: draftData.humanResources,
    trialBalance: draftData.trialBalance,
    creditReports: draftData.creditReports,
    acceptedTerms: true,
  });

  if (!validation.success) {
    return { ok: false, message: PAYMENT_VALIDATION_FAILED_MESSAGE };
  }

  const persistedDraft = {
    currentStep: draftData.currentStep ?? application.currentStep,
    taxDeclarations: validation.data.taxDeclarations,
    financials: validation.data.financials,
    humanResources: validation.data.humanResources,
    trialBalance: validation.data.trialBalance,
    creditReports: validation.data.creditReports,
  };

  const hasVerifiedPayment = application.payments.some(
    (payment) => payment.status === PaymentStatus.VERIFIED,
  );

  if (hasVerifiedPayment && application.status === ApplicationStatus.NEEDS_EDIT) {
    await db.application.update({
      where: { id: application.id },
      data: {
        ...persistedDraft,
        status: ApplicationStatus.SUBMITTED,
      },
    });
    logger.info("application_resubmitted_without_payment", {
      applicationId: application.id,
    });
    return { ok: true, redirectTo: "/dashboard" };
  }

  if (hasVerifiedPayment) {
    return { ok: false, message: "پرداخت قبلاً ثبت شده است" };
  }

  logger.info("payment_start_rejected_disabled", {
    applicationId: application.id,
  });
  return { ok: false, message: PAYMENT_DISABLED_MESSAGE };
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
