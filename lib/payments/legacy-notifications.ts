import { logger } from "@/lib/logger";
import { sendSms } from "@/lib/sms";
import { createAdminSubmissionSmsMessage, createSubmissionReceivedSmsMessage } from "@/lib/sms/messages";

/**
 * Post-payment notifications for the company-registration flow. This module is
 * deliberately NOT a `"use server"` file: every export of an action module is
 * registered as a callable server action, and an SMS sender that takes an
 * arbitrary mobile number must never be reachable from a browser.
 */
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
