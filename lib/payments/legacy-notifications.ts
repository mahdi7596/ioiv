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

/** One durable logical intent; an interrupted/uncertain SMS is never blindly resent. */
export async function dispatchSubmissionIntent(applicationId: string, mobile: string) {
  try { await dispatchIntent(applicationId, mobile); }
  catch (error) { logger.error("payment_notification_intent_unavailable", error, { applicationId }); }
}

async function dispatchIntent(applicationId: string, mobile: string) {
  const { db } = await import("@/lib/db");
  const obligation = await db.paymentObligation.findUnique({ where: { legacyApplicationId: applicationId } });
  if (!obligation) return;
  const claim = await db.paymentNotificationIntent.updateMany({ where: { obligationId: obligation.id, state: "PENDING" }, data: { state: "CLAIMED" } });
  if (!claim.count) return;
  try {
    await Promise.all([notifyAdminOfSubmission(applicationId), notifyUserOfSubmission(mobile, applicationId)]);
    await db.paymentNotificationIntent.update({ where: { obligationId: obligation.id }, data: { state: "SENT" } });
  } catch (error) {
    await db.paymentNotificationIntent.update({ where: { obligationId: obligation.id }, data: { state: "UNKNOWN" } }).catch(() => undefined);
    logger.error("payment_notification_failed", error, { applicationId });
  }
}
