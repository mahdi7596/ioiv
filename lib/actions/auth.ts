import { OtpPurpose } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { logger, maskMobile } from "@/lib/logger";
import { sendSms } from "@/lib/sms";
import { createOtpSmsMessage } from "@/lib/sms/messages";
import { requestOtpSchema, verifyOtpSchema } from "@/lib/validations/auth";

const OTP_TTL_MS = 2 * 60 * 1000;
const OTP_REQUEST_COOLDOWN_MS = 90 * 1000;
const OTP_REQUEST_WINDOW_MS = 60 * 60 * 1000;
const OTP_MAX_REQUESTS_PER_WINDOW = 5;

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
  return randomInt(1000, 10000).toString();
}

async function enforceOtpRequestLimits(mobile: string, purpose: OtpPurpose, now: Date) {
  const cooldownStart = new Date(now.getTime() - OTP_REQUEST_COOLDOWN_MS);
  const windowStart = new Date(now.getTime() - OTP_REQUEST_WINDOW_MS);
  const latestOtp = await db.otpCode.findFirst({
    where: {
      mobile,
      purpose,
      createdAt: { gte: cooldownStart },
    },
    orderBy: { createdAt: "desc" },
  });

  if (latestOtp) {
    throw new ActionError("لطفاً کمی بعد دوباره برای دریافت کد تلاش کنید", 429);
  }

  const recentRequestCount = await db.otpCode.count({
    where: {
      mobile,
      purpose,
      createdAt: { gte: windowStart },
    },
  });

  if (recentRequestCount >= OTP_MAX_REQUESTS_PER_WINDOW) {
    throw new ActionError("تعداد درخواست‌های کد تایید بیش از حد مجاز است", 429);
  }
}

export async function requestOtp(input: unknown): Promise<{ next: "otp" | "register" }> {
  const parsed = requestOtpSchema.safeParse(input);

  if (!parsed.success) {
    throw new ActionError(parsed.error.issues[0]?.message || "Invalid OTP request");
  }

  const { mobile, mode } = parsed.data;
  const purpose = otpPurposeForMode(mode);

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
      throw new ActionError("دسترسی مدیریت برای این شماره فعال نیست", 403);
    }
  }

  const now = new Date();
  await enforceOtpRequestLimits(mobile, purpose, now);
  const code = generateOtp();
  const codeHash = await bcrypt.hash(code, 10);

  await db.otpCode.updateMany({
    where: {
      mobile,
      purpose,
      consumedAt: null,
    },
    data: { consumedAt: now },
  });

  await db.otpCode.create({
    data: {
      mobile,
      purpose,
      codeHash,
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    },
  });

  try {
    await sendSms(createOtpSmsMessage(mobile, code));
  } catch {
    throw new ActionError("ارسال پیامک ناموفق بود. کمی بعد دوباره تلاش کنید.", 502);
  }

  if (mode === "admin") {
    logger.info("otp_request_completed", {
      mode,
      mobile: maskMobile(mobile),
      next: "otp",
    });
    return { next: "otp" };
  }

  logger.info("otp_request_completed", {
    mode,
    mobile: maskMobile(mobile),
    next: "otp",
  });
  return { next: "otp" };
}

export async function verifyOtp(input: unknown): Promise<{ redirectTo?: string; next?: "register" }> {
  const parsed = verifyOtpSchema.safeParse(input);

  if (!parsed.success) {
    throw new ActionError(parsed.error.issues[0]?.message || "Invalid OTP verification");
  }

  const {
    mobile,
    code,
    mode,
    companyName,
    companyNationalId,
    companyContactFullName,
    companyContactNationalCode,
  } = parsed.data;
  const purpose = otpPurposeForMode(mode);

  logger.info("otp_verify_started", {
    mode,
    mobile: maskMobile(mobile),
  });

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

  if (mode === "admin") {
    const admin = await db.admin.findUnique({ where: { mobile } });

    if (!admin?.active) {
      throw new ActionError("دسترسی مدیریت برای این شماره فعال نیست", 403);
    }

    await db.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });
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
    logger.info("otp_verify_requires_registration", {
      mode,
      mobile: maskMobile(mobile),
    });
    return { next: "register" };
  }

  const user =
    existingUser ??
    (await db.user.create({
      data: {
        mobile,
        companyName,
        companyNationalId,
        companyContactFullName,
        companyContactNationalCode,
      },
    }));

  await db.otpCode.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  });
  await createSession({ subjectId: user.id, kind: "user" });
  logger.info("otp_verify_completed", {
    mode,
    mobile: maskMobile(mobile),
    userId: user.id,
    createdUser: !existingUser,
  });
  return { redirectTo: "/dashboard" };
}
