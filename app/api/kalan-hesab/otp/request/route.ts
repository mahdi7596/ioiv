import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { OtpPurpose } from "@prisma/client";
import { db } from "@/lib/db";
import { logger, maskMobile } from "@/lib/logger";
import { sendSms } from "@/lib/sms";
import { createOtpSmsMessage } from "@/lib/sms/messages";
import { mobileSchema } from "@/lib/validations/auth";

const OTP_TTL_MS = 2 * 60 * 1000;
const OTP_REQUEST_COOLDOWN_MS = 90 * 1000;
const OTP_REQUEST_WINDOW_MS = 60 * 60 * 1000;
const OTP_MAX_REQUESTS_PER_WINDOW = 5;

const schema = z.object({ mobile: mobileSchema });

export async function POST(request: Request) {
  try {
    const { mobile } = schema.parse(await request.json());

    const now = new Date();
    const cooldownStart = new Date(now.getTime() - OTP_REQUEST_COOLDOWN_MS);
    const windowStart = new Date(now.getTime() - OTP_REQUEST_WINDOW_MS);

    const recentOtp = await db.otpCode.findFirst({
      where: {
        mobile,
        purpose: OtpPurpose.KALAN_HESAB_VERIFICATION,
        createdAt: { gte: cooldownStart },
      },
    });

    if (recentOtp) {
      return Response.json(
        { error: "لطفاً کمی بعد دوباره برای دریافت کد تلاش کنید" },
        { status: 429 }
      );
    }

    const recentCount = await db.otpCode.count({
      where: {
        mobile,
        purpose: OtpPurpose.KALAN_HESAB_VERIFICATION,
        createdAt: { gte: windowStart },
      },
    });

    if (recentCount >= OTP_MAX_REQUESTS_PER_WINDOW) {
      return Response.json(
        { error: "تعداد درخواست‌های کد تایید بیش از حد مجاز است" },
        { status: 429 }
      );
    }

    const code = randomInt(1000, 10000).toString();
    const codeHash = await bcrypt.hash(code, 10);

    await db.otpCode.updateMany({
      where: { mobile, purpose: OtpPurpose.KALAN_HESAB_VERIFICATION, consumedAt: null },
      data: { consumedAt: now },
    });

    await db.otpCode.create({
      data: {
        mobile,
        purpose: OtpPurpose.KALAN_HESAB_VERIFICATION,
        codeHash,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      },
    });

    await sendSms(createOtpSmsMessage(mobile, code));

    logger.info("kalan_hesab_otp_requested", { mobile: maskMobile(mobile) });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "شماره موبایل معتبر نیست" }, { status: 400 });
    }
    logger.error("kalan_hesab_otp_request_failed", error);
    return Response.json({ error: "خطای غیرمنتظره رخ داد" }, { status: 500 });
  }
}
