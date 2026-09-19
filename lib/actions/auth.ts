import { reserveOtpRequest, claimOtpDispatch, REQUEST_LIMIT_MESSAGE, REQUEST_UNAVAILABLE_MESSAGE } from "@/lib/auth/request";
import { reserveVerificationBudget, reserveOtpGuess, consumeOtpForSession, OtpConsumeRejected, VERIFY_LIMIT_MESSAGE, VERIFY_UNAVAILABLE_MESSAGE } from "@/lib/auth/verification";
import { OtpPurpose } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { sendSms } from "@/lib/sms";
import { createOtpSmsMessage } from "@/lib/sms/messages";
import { requestOtpSchema, verifyOtpSchema } from "@/lib/validations/auth";
import { ADMIN_REQUEST_MESSAGE, adminResponseDeadline, waitForAdminResponse } from "@/lib/auth/admin-response";

// bcrypt("000000", 10). Compared against when no code exists so a missing code
// costs the same time as a wrong one.
const DUMMY_OTP_HASH = "$2b$10$lfAkj/0.RL.TAAzOaVFUiO7Ag510ugifgmMPRn0TaqbQt8dX.Twne";
const OTP_INVALID_MESSAGE = "کد تایید معتبر نیست یا منقضی شده است";

export type OtpRequestContext = {
  /** Qualified canonical client address; null uses a bounded shared unknown budget. */
  clientIp?: string | null;
};

export const DUPLICATE_COMPANY_NATIONAL_ID_MESSAGE = "این شناسه ملی شرکت قبلاً ثبت شده است";

export class ActionError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function otpPurposeForMode(mode: "user" | "admin") {
  return mode === "admin" ? OtpPurpose.ADMIN_LOGIN : OtpPurpose.USER_LOGIN;
}

function generateOtp() {
  return randomInt(100000, 1000000).toString();
}

export function isCompanyNationalIdUniqueError(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  const target = candidate.meta?.target;
  return (
    candidate.code === "P2002" &&
    (Array.isArray(target)
      ? target.includes("companyNationalId")
      : target === "User_companyNationalId_key")
  );
}

export async function requestOtp(input: unknown, context: OtpRequestContext = {}): Promise<{ next: "otp" | "register"; warning?: string }> {
  const parsed = requestOtpSchema.safeParse(input);
  if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message || "Invalid OTP request");
  const { mobile, mode } = parsed.data;
  const purpose = otpPurposeForMode(mode);
  try {
    const intent = await reserveOtpRequest(mobile, purpose, context.clientIp ?? null);
    if (!intent) throw new ActionError(REQUEST_LIMIT_MESSAGE, 429);
    if (mode === "admin") {
      const deadline = adminResponseDeadline();
      try {
        const admin = await db.$transaction(tx => tx.admin.findUnique({
          where: { mobile }, select: { active: true },
        }), { maxWait: 1000, timeout: 2000 });
        const code = generateOtp();
        const codeHash = await bcrypt.hash(code, 10);
        if (admin?.active && await claimOtpDispatch(intent, mobile, purpose, codeHash)) {
          await sendSms(createOtpSmsMessage(mobile, code));
        }
      } catch {
        logger.warn("admin_otp_unconfirmed", { reason: "request_or_delivery_unconfirmed" });
      }
      await waitForAdminResponse(deadline);
      return { next: "otp", warning: ADMIN_REQUEST_MESSAGE };
    }
    const code = generateOtp();
    const codeHash = await bcrypt.hash(code, 10);
    if (!await claimOtpDispatch(intent, mobile, purpose, codeHash)) throw new ActionError(REQUEST_UNAVAILABLE_MESSAGE, 503);
    try {
      await sendSms(createOtpSmsMessage(mobile, code));
    } catch {
      logger.warn("otp_sms_unconfirmed", { reason: "delivery_unconfirmed" });
      return { next: "otp", warning: REQUEST_UNAVAILABLE_MESSAGE };
    }
    return { next: "otp" };
  } catch (error) {
    if (error instanceof ActionError) throw error;
    // Provider/DB errors can contain OTP text and query parameters.
    logger.warn("otp_request_unavailable", { reason: "request_or_dispatch_failed" });
    throw new ActionError(REQUEST_UNAVAILABLE_MESSAGE, 503);
  }
}

export async function verifyOtp(input: unknown, context: OtpRequestContext = {}): Promise<{ redirectTo: string }> {
  const parsed = verifyOtpSchema.safeParse(input);
  if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message || "Invalid OTP verification");
  const { mobile, code, mode } = parsed.data;
  const purpose = otpPurposeForMode(mode);
  try {
    if (!await reserveVerificationBudget(mobile, purpose, context.clientIp ?? null)) {
      throw new ActionError(VERIFY_LIMIT_MESSAGE, 429);
    }
    const otp = await reserveOtpGuess(mobile, purpose);
    const matches = await bcrypt.compare(code, otp?.codeHash ?? DUMMY_OTP_HASH);
    if (!otp || !matches) throw new ActionError(OTP_INVALID_MESSAGE);
    const session = await consumeOtpForSession(otp.id, mobile, purpose);
    if (!session) throw new ActionError(OTP_INVALID_MESSAGE);
    await createSession(session);
    return { redirectTo: mode === "admin" ? "/admin" : "/dashboard" };
  } catch (error) {
    if (error instanceof ActionError) throw error;
    if (error instanceof OtpConsumeRejected) throw new ActionError(OTP_INVALID_MESSAGE);
    // DB errors may embed query parameters: never log the exception or identifiers.
    logger.warn("otp_verify_unavailable", { reason: "verification_failed" });
    throw new ActionError(VERIFY_UNAVAILABLE_MESSAGE, 503);
  }
}
