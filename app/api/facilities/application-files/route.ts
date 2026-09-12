import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { FilesystemFacilitiesPrivateStorage } from "@/lib/facilities-files/storage";
import { createFacilitiesScannerFromEnv } from "@/lib/facilities-files/scanner";
import { storeOwnedFacilitiesFile } from "@/lib/facilities-files/service";
import { verifyFacilitiesUpload } from "@/lib/facilities-files/verification";
import { FACILITIES_EDITABLE_STATUSES } from "@/lib/facilities/review-status";
import { facilitiesUploadRecoveryMessage, facilitiesUploadRecoveryState } from "@/lib/facilities-files/retention";

function allowed(slot: string, type: string) {
  if (["questionnaire"].includes(slot)) return type === "DOC" || type === "DOCX";
  if (["licences", "active-contracts"].includes(slot) || slot.startsWith("vat-")) return type === "ZIP";
  return ["PDF", "DOC", "DOCX", "XLS", "XLSX", "CSV", "ZIP"].includes(type);
}
export async function POST(request: Request) {
  try {
    const session = await requireSession("user"); const form = await request.formData(); const bindingId = form.get("bindingId"); const idempotencyKey = form.get("idempotencyKey"); const file = form.get("file");
    if (typeof bindingId !== "string" || typeof idempotencyKey !== "string" || !(file instanceof File) || file.size > 25 * 1024 * 1024) return Response.json({ error: "درخواست بارگذاری معتبر نیست" }, { status: 400 });
    const programme = await db.facilitiesProgramConfiguration.findUnique({ where: { program: "FACILITIES" } }); const bytes = Buffer.from(await file.arrayBuffer());
    const binding = await db.facilitiesFileBinding.findFirst({ where: { id: bindingId, userId: session.subjectId, scope: "APPLICATION", application: { status: { in: FACILITIES_EDITABLE_STATUSES }, userId: session.subjectId } } });
    const verified = verifyFacilitiesUpload({ fileName: file.name, bytes });
    const isCorrection = binding?.applicationId ? await db.facilitiesApplication.count({ where: { id: binding.applicationId, status: "NEEDS_EDIT" } }) : 0;
    if ((!programme?.isEnabled && !isCorrection) || !binding || !allowed(binding.slotKey, verified.fileType)) return Response.json({ error: "نوع فایل برای این مدرک معتبر نیست" }, { status: 400 });
    const result = await storeOwnedFacilitiesFile({ userId: session.subjectId, bindingId, idempotencyKey, fileName: file.name, bytes, storage: new FilesystemFacilitiesPrivateStorage(), scanner: createFacilitiesScannerFromEnv() });
    if (result.lifecycleStatus !== "PASSED") return Response.json({ lifecycleStatus: result.lifecycleStatus, recoveryState: facilitiesUploadRecoveryState(result.lifecycleStatus), uploadId: result.uploadId, error: facilitiesUploadRecoveryMessage(result.lifecycleStatus) }, { status: result.lifecycleStatus === "UNAVAILABLE" ? 503 : 422 });
    return Response.json({ lifecycleStatus: result.lifecycleStatus, uploadId: result.uploadId });
  } catch { return Response.json({ error: "بارگذاری فایل ناموفق بود؛ دوباره تلاش کنید" }, { status: 400 }); }
}
