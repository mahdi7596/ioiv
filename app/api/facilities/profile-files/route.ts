import { requireSession } from "@/lib/auth/session";
import { FilesystemFacilitiesPrivateStorage } from "@/lib/facilities-files/storage";
import { createFacilitiesScannerFromEnv } from "@/lib/facilities-files/scanner";
import { storeOwnedFacilitiesFile } from "@/lib/facilities-files/service";
import { db } from "@/lib/db";
import { assertFacilitiesProfileEditable } from "@/lib/facilities/profile-lock";
import { ActionError } from "@/lib/actions/auth";
import { facilitiesUploadRecoveryMessage, facilitiesUploadRecoveryState } from "@/lib/facilities-files/retention";

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
    if (!binding.companyId) return Response.json({ error: "دسترسی امکان‌پذیر نیست" }, { status: 403 });
    await assertFacilitiesProfileEditable(db, binding.companyId);
    const result = await storeOwnedFacilitiesFile({ userId: session.subjectId, bindingId, idempotencyKey, fileName: file.name, bytes: Buffer.from(await file.arrayBuffer()), storage: new FilesystemFacilitiesPrivateStorage(), scanner: createFacilitiesScannerFromEnv() });
    if (result.lifecycleStatus !== "PASSED") return Response.json({ lifecycleStatus: result.lifecycleStatus, recoveryState: facilitiesUploadRecoveryState(result.lifecycleStatus), uploadId: result.uploadId, error: facilitiesUploadRecoveryMessage(result.lifecycleStatus) }, { status: result.lifecycleStatus === "UNAVAILABLE" ? 503 : 422 });
    return Response.json({ lifecycleStatus: result.lifecycleStatus, uploadId: result.uploadId });
  } catch (error) {
    const message = error instanceof Error && (error.message === "FACILITIES_FILE_FORBIDDEN" || error.message.includes("پروفایل شرکت")) ? error.message === "FACILITIES_FILE_FORBIDDEN" ? "دسترسی امکان‌پذیر نیست" : error.message : "بارگذاری فایل ناموفق بود";
    return Response.json({ error: message }, { status: error instanceof ActionError ? error.status : 400 });
  }
}
