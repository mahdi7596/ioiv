import { OtpPurpose } from "@prisma/client";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { logger, maskMobile } from "@/lib/logger";
import { sendSms } from "@/lib/sms";
import { createOtpSmsMessage } from "@/lib/sms/messages";
import { requestOtpSchema, verifyOtpSchema } from "@/lib/validations/auth";

const OTP_TTL_MS = 2 * 60 * 1000;

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
  return Math.floor(1000 + Math.random() * 9000).toString();
}

const DEV_OTP_CODE = "1234";

function isDevelopmentFallbackEnabled() {
  return process.env.NODE_ENV !== "production";
}

export async function requestOtp(input: unknown): Promise<{ next: "otp" | "register"; devOtp?: string }> {
  const parsed = requestOtpSchema.safeParse(input);

  if (!parsed.success) {
    throw new ActionError(parsed.error.issues[0]?.message || "Invalid OTP request");
  }

  const { mobile, mode } = parsed.data;
  const purpose = otpPurposeForMode(mode);

  try {
    logger.info("otp_request_started", {
      mode,
      mobile: maskMobile(mobile),
    });

    if (mode === "admin") {
      const admin = await db.admin.findUnique({ where: { mobile } });

      if (!admin?.active) {
        logger.warn("otp_request_rejected_inactive_admin", {
          mobile: maskMobile(mobile),
        });
        throw new ActionError("مدیر فعالی با این شماره پیدا نشد", 403);
      }
    }

    const code = generateOtp();
    const codeHash = await bcrypt.hash(code, 10);

    await db.otpCode.create({
      data: {
        mobile,
        purpose,
        codeHash,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    await sendSms(createOtpSmsMessage(mobile, code));

    if (mode === "admin") {
      logger.info("otp_request_completed", {
        mode,
        mobile: maskMobile(mobile),
        next: "otp",
      });
      return { next: "otp", devOtp: process.env.NODE_ENV !== "production" ? code : undefined };
    }

    const user = await db.user.findUnique({ where: { mobile } });
    const next = user ? "otp" : "register";
    logger.info("otp_request_completed", {
      mode,
      mobile: maskMobile(mobile),
      next,
    });
    return { next, devOtp: process.env.NODE_ENV !== "production" ? code : undefined };
  } catch (error) {
    if (error instanceof ActionError || !isDevelopmentFallbackEnabled()) {
      throw error;
    }

    logger.warn("otp_development_fallback_used", {
      mode,
      mobile: maskMobile(mobile),
      error: error instanceof Error ? error.message : String(error),
    });
    return { next: mode === "admin" ? "otp" : "register", devOtp: DEV_OTP_CODE };
  }
}

export async function verifyOtp(input: unknown): Promise<{ redirectTo: string }> {
  const parsed = verifyOtpSchema.safeParse(input);

  if (!parsed.success) {
    throw new ActionError(parsed.error.issues[0]?.message || "Invalid OTP verification");
  }

  const { mobile, code, mode, companyNationalId } = parsed.data;
  const purpose = otpPurposeForMode(mode);

  logger.info("otp_verify_started", {
    mode,
    mobile: maskMobile(mobile),
  });

  if (isDevelopmentFallbackEnabled() && code === DEV_OTP_CODE) {
    if (mode === "user" && !companyNationalId) {
      throw new ActionError("شناسه ملی شرکت الزامی است");
    }

    await createSession({
      subjectId: mode === "admin" ? `dev-admin:${mobile}` : `dev-user:${mobile}:${companyNationalId}`,
      kind: mode,
    });

    logger.info("otp_verify_completed", {
      mode,
      mobile: maskMobile(mobile),
      developmentFallback: true,
    });
    return { redirectTo: mode === "admin" ? "/admin" : "/dashboard" };
  }

  const otp = await db.otpCode.findFirst({
    where: {
      mobile,
      purpose,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otp || !(await bcrypt.compare(code, otp.codeHash))) {
    logger.warn("otp_verify_rejected", {
      mode,
      mobile: maskMobile(mobile),
      reason: "invalid_or_expired",
    });
    throw new ActionError("کد تایید معتبر نیست یا منقضی شده است");
  }

  await db.otpCode.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  });

  if (mode === "admin") {
    const admin = await db.admin.findUnique({ where: { mobile } });

    if (!admin?.active) {
      throw new ActionError("دسترسی مدیریت برای این شماره فعال نیست", 403);
    }

    await createSession({ subjectId: admin.id, kind: "admin" });
    logger.info("otp_verify_completed", {
      mode,
      mobile: maskMobile(mobile),
      adminId: admin.id,
    });
    return { redirectTo: "/admin" };
  }

  const existingUser = await db.user.findUnique({ where: { mobile } });

  if (!existingUser && !companyNationalId) {
    throw new ActionError("شناسه ملی شرکت الزامی است");
  }

  const user =
    existingUser ??
    (await db.user.create({
      data: {
        mobile,
        companyNationalId,
      },
    }));

  await createSession({ subjectId: user.id, kind: "user" });
  logger.info("otp_verify_completed", {
    mode,
    mobile: maskMobile(mobile),
    userId: user.id,
    createdUser: !existingUser,
  });
  return { redirectTo: "/dashboard" };
}
