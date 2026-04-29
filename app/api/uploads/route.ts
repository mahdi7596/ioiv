import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { canEditApplication } from "@/lib/application/status";
import { storeUploadFile } from "@/lib/uploads/storage";

export async function POST(request: Request) {
  try {
    const session = await requireSession("user");
    const formData = await request.formData();
    const applicationId = String(formData.get("applicationId") || "");
    const fieldKey = String(formData.get("fieldKey") || "");
    const file = formData.get("file");

    if (!applicationId || !fieldKey || !(file instanceof File)) {
      return Response.json({ error: "درخواست بارگذاری معتبر نیست" }, { status: 400 });
    }

    const application = await db.application.findUnique({ where: { id: applicationId } });

    if (
      !application ||
      application.userId !== session.subjectId ||
      !canEditApplication(application.status)
    ) {
      return Response.json({ error: "اجازه بارگذاری فایل برای این پرونده وجود ندارد" }, { status: 403 });
    }

    const stored = await storeUploadFile({ applicationId, fieldKey, file });
    const record = await db.applicationFile.create({
      data: {
        applicationId,
        fieldKey,
        originalName: stored.originalName,
        mimeType: stored.mimeType,
        size: stored.size,
        storagePath: stored.storagePath,
      },
    });

    return Response.json({
      fileId: record.id,
      name: record.originalName,
      fieldKey: record.fieldKey,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "";
    const knownMessages = [
      "Unauthorized",
      "نوع فایل مجاز نیست",
      "حجم فایل نباید بیشتر از ۲۰ مگابایت باشد",
    ];
    const safeMessage = knownMessages.includes(message) ? message : "بارگذاری فایل ناموفق بود";
    const status = message === "Unauthorized" ? 401 : 400;

    return Response.json({ error: safeMessage }, { status });
  }
}
