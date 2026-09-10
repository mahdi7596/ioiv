import { requireSession } from "@/lib/auth/session";
import { FilesystemFacilitiesPrivateStorage } from "@/lib/facilities-files/storage";
import { createFacilitiesScannerFromEnv } from "@/lib/facilities-files/scanner";
import { storeOwnedFacilitiesFile } from "@/lib/facilities-files/service";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const session = await requireSession("user");
    const form = await request.formData();
    const bindingId = form.get("bindingId");
    const idempotencyKey = form.get("idempotencyKey");
    const file = form.get("file");
    if (typeof bindingId !== "string" || typeof idempotencyKey !== "string" || !(file instanceof File)) return Response.json({ error: "درخواست بارگذاری معتبر نیست" }, { status: 400 });
    if (file.size > 25 * 1024 * 1024) return Response.json({ error: "حجم فایل بیش از حد مجاز است" }, { status: 400 });
    const binding = await db.facilitiesFileBinding.findFirst({ where: { id: bindingId, userId: session.subjectId, scope: "COMPANY_PROFILE" } });
    if (!binding || (binding.slotKey.endsWith("-identity-package") && !file.name.toLowerCase().endsWith(".zip"))) return Response.json({ error: "دسترسی یا نوع فایل معتبر نیست" }, { status: 400 });
    const result = await storeOwnedFacilitiesFile({ userId: session.subjectId, bindingId, idempotencyKey, fileName: file.name, bytes: Buffer.from(await file.arrayBuffer()), storage: new FilesystemFacilitiesPrivateStorage(), scanner: createFacilitiesScannerFromEnv() });
    return Response.json({ lifecycleStatus: result.lifecycleStatus, uploadId: result.uploadId });
  } catch (error) {
    const message = error instanceof Error && error.message === "FACILITIES_FILE_FORBIDDEN" ? "دسترسی امکان‌پذیر نیست" : "بارگذاری فایل ناموفق بود";
    return Response.json({ error: message }, { status: 400 });
  }
}
