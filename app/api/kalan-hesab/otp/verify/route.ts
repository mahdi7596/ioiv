import { z } from "zod";
import bcrypt from "bcryptjs";
import { OtpPurpose } from "@prisma/client";
import { db } from "@/lib/db";
import { logger, maskMobile } from "@/lib/logger";
import { mobileSchema, otpSchema } from "@/lib/validations/auth";

const schema = z.object({ mobile: mobileSchema, code: otpSchema });

export async function POST(request: Request) {
  try {
    const { mobile, code } = schema.parse(await request.json());

    const otp = await db.otpCode.findFirst({
      where: {
        mobile,
        purpose: OtpPurpose.KALAN_HESAB_VERIFICATION,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otp || !(await bcrypt.compare(code, otp.codeHash))) {
      return Response.json({ error: "کد تایید نامعتبر یا منقضی شده است" }, { status: 400 });
    }

    await db.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });

    logger.info("kalan_hesab_otp_verified", { mobile: maskMobile(mobile) });

    return Response.json({ verified: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "اطلاعات ورودی نامعتبر است" }, { status: 400 });
    }
    logger.error("kalan_hesab_otp_verify_failed", error);
    return Response.json({ error: "خطای غیرمنتظره رخ داد" }, { status: 500 });
  }
}
