import { z } from "zod";
import { db } from "@/lib/db";
import { logger, maskMobile } from "@/lib/logger";
import { sendSms } from "@/lib/sms";
import {
  createKalanHesabUserSmsMessage,
  createKalanHesabAdminSmsMessage,
} from "@/lib/sms/messages";
import { mobileSchema } from "@/lib/validations/auth";

const schema = z.object({
  fullName: z.string().min(2),
  companyName: z.string().min(1),
  position: z.enum(["مدیرعامل", "عضو هیئت مدیره", "مدیرمالی", "صاحب کسب‌وکار", "سایر"]),
  positionOther: z.string().optional(),
  teamSize: z.enum(["کمتر از ۱۰", "۱۰ تا ۵۰", "۵۰ تا ۲۰۰", "بیش از ۲۰۰"]),
  mainConcern: z.enum([
    "مدیریت مالی",
    "مالیات",
    "تامین اجتماعی",
    "گزارشات مدیریتی",
    "حسابرسی",
    "تامین مالی",
    "سایر",
  ]),
  concernOther: z.string().optional(),
  mobile: mobileSchema,
});

const ADMIN_NUMBERS = ["09390649614"] as const;

export async function POST(request: Request) {
  try {
    const data = schema.parse(await request.json());

    const submission = await db.kalanHesabSubmission.create({
      data: {
        fullName: data.fullName,
        companyName: data.companyName,
        position: data.position,
        positionOther: data.positionOther,
        teamSize: data.teamSize,
        mainConcern: data.mainConcern,
        concernOther: data.concernOther,
        mobile: data.mobile,
      },
    });

    await sendSms(createKalanHesabUserSmsMessage(data.mobile));
    for (const number of ADMIN_NUMBERS) {
      await sendSms(createKalanHesabAdminSmsMessage(number, data.fullName));
    }

    logger.info("kalan_hesab_submission_created", {
      submissionId: submission.id,
      mobile: maskMobile(data.mobile),
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "اطلاعات فرم ناقص یا نامعتبر است" }, { status: 400 });
    }
    logger.error("kalan_hesab_submit_failed", error);
    return Response.json({ error: "خطای غیرمنتظره رخ داد" }, { status: 500 });
  }
}
