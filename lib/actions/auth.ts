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
const OTP_MAX_VERIFY_ATTEMPTS = 5;
const OTP_DEFAULT_MAX_REQUESTS_PER_IP_PER_WINDOW = 30;
// bcrypt("000000", 10). Compared against when no code exists so a missing code
// costs the same time as a wrong one.
const DUMMY_OTP_HASH = "$2b$10$lfAkj/0.RL.TAAzOaVFUiO7Ag510ugifgmMPRn0TaqbQt8dX.Twne";
const OTP_INVALID_MESSAGE = "کد تایید معتبر نیست یا منقضی شده است";

export type OtpRequestContext = {
  /** Client address from the route handler; null when unknown (limits by IP are skipped). */
  clientIp?: string | null;
};

function maxOtpRequestsPerIp() {
  const configured = Number(process.env.OTP_MAX_REQUESTS_PER_IP_PER_WINDOW);
  return Number.isInteger(configured) && configured > 0 ? configured : OTP_DEFAULT_MAX_REQUESTS_PER_IP_PER_WINDOW;
}
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

async function enforceOtpRequestLimits(mobile: string, purpose: OtpPurpose, now: Date, clientIp: string | null) {
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

  // Per-address cap across all mobiles, so iterating numbers cannot drain the
  // SMS budget. Skipped when the address is unknown. If a CDN fronts nginx,
  // X-Real-IP is the CDN address and this cap is shared; keep it generous and
  // watch for otp_ip_limit_hit before lowering OTP_MAX_REQUESTS_PER_IP_PER_WINDOW.
  if (clientIp) {
    const perIpCount = await db.otpCode.count({
      where: {
        requestIp: clientIp,
        createdAt: { gte: windowStart },
      },
    });

    if (perIpCount >= maxOtpRequestsPerIp()) {
      logger.warn("otp_ip_limit_hit", { clientIp, purpose, count: perIpCount });
      throw new ActionError("تعداد درخواست‌های کد تایید بیش از حد مجاز است", 429);
    }
  }
}

export async function requestOtp(input: unknown, context: OtpRequestContext = {}): Promise<{ next: "otp" | "register" }> {
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

  const clientIp = context.clientIp ?? null;
  const now = new Date();
  // Rate limits run first so the admin-existence response cannot be used to
  // enumerate admin mobiles at an unthrottled rate.
  await enforceOtpRequestLimits(mobile, purpose, now, clientIp);

  if (mode === "admin") {
    const admin = await db.admin.findUnique({ where: { mobile } });

    if (!admin?.active) {
      logger.warn("otp_request_rejected_inactive_admin", {
        mobile: maskMobile(mobile),
      });
      throw new ActionError("دسترسی مدیریت برای این شماره فعال نیست", 403);
    }
  }

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
      requestIp: clientIp,
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

export async function verifyOtp(input: unknown, context: OtpRequestContext = {}): Promise<{ redirectTo: string }> {
  const parsed = verifyOtpSchema.safeParse(input);

  if (!parsed.success) {
    throw new ActionError(parsed.error.issues[0]?.message || "Invalid OTP verification");
  }

  const { mobile, code, mode } = parsed.data;
  const purpose = otpPurposeForMode(mode);
  const now = new Date();

  logger.info("otp_verify_started", {
    mode,
    mobile: maskMobile(mobile),
  });

  const otp = await db.otpCode.findFirst({
    where: {
      mobile,
      purpose,
      consumedAt: null,
      expiresAt: { gt: now },
      attemptCount: { lt: OTP_MAX_VERIFY_ATTEMPTS },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    // Keep the timing of "no usable code" indistinguishable from a wrong code.
    await bcrypt.compare(code, DUMMY_OTP_HASH);
    logger.warn("otp_verify_rejected", {
      mode,
      mobile: maskMobile(mobile),
      reason: "invalid_or_expired",
    });
    throw new ActionError(OTP_INVALID_MESSAGE);
  }

  if (!(await bcrypt.compare(code, otp.codeHash))) {
    // Count the failure; once attemptCount reaches the cap the findFirst above
    // never returns this code again, so five guesses per code is the ceiling.
    await db.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { attemptCount: { increment: 1 } },
    });
    logger.warn("otp_verify_rejected", {
      mode,
      mobile: maskMobile(mobile),
      reason: "invalid_code",
      attempt: otp.attemptCount + 1,
      clientIp: context.clientIp ?? undefined,
    });
    throw new ActionError(OTP_INVALID_MESSAGE);
  }

  // Consume atomically: two concurrent correct verifications race here and only
  // the one that flips consumedAt may mint a session.
  const consumed = await db.otpCode.updateMany({
    where: { id: otp.id, consumedAt: null },
    data: { consumedAt: now },
  });

  if (consumed.count !== 1) {
    logger.warn("otp_verify_rejected", {
      mode,
      mobile: maskMobile(mobile),
      reason: "already_consumed",
    });
    throw new ActionError(OTP_INVALID_MESSAGE);
  }

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
  const user = existingUser ?? (await db.user.create({ data: { mobile } }));

  await createSession({ subjectId: user.id, kind: "user" });
  logger.info("otp_verify_completed", {
    mode,
    mobile: maskMobile(mobile),
    userId: user.id,
    createdUser: !existingUser,
  });
  return { redirectTo: "/dashboard" };
}
