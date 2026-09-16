import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { FilesystemFacilitiesPrivateStorage } from "@/lib/facilities-files/storage";
import { createFacilitiesScannerFromEnv } from "@/lib/facilities-files/scanner";
import { storeOwnedFacilitiesFile } from "@/lib/facilities-files/service";
import { MAX_FACILITIES_FILE_BYTES, verifyFacilitiesUpload } from "@/lib/facilities-files/verification";
import { admitUpload, rejectOversizedUploadRequest } from "@/lib/uploads/request-guards";
import { FacilitiesFileError, describeFacilitiesFileError } from "@/lib/facilities-files/errors";
import { FACILITIES_EDITABLE_STATUSES } from "@/lib/facilities/review-status";
import { facilitiesUploadRecoveryMessage, facilitiesUploadRecoveryState } from "@/lib/facilities-files/retention";

function allowed(slot: string, type: string) {
  if (["questionnaire"].includes(slot)) return type === "DOC" || type === "DOCX";
  if (["licences", "active-contracts"].includes(slot) || slot.startsWith("vat-")) return type === "ZIP";
  return ["PDF", "DOC", "DOCX", "XLS", "XLSX", "CSV", "ZIP", "JPG", "PNG", "WEBP", "HEIC"].includes(type);
}
export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try {
    const session = await requireSession("user");
    // Declared-length and admission gates run before the body is buffered.
    const oversized = rejectOversizedUploadRequest(request, MAX_FACILITIES_FILE_BYTES);
    if (oversized) return oversized;
    const gate = admitUpload(request, session.subjectId);
    if (!gate.ok) return gate.response;
    release = gate.release;
    const form = await request.formData(); const bindingId = form.get("bindingId"); const idempotencyKey = form.get("idempotencyKey"); const file = form.get("file");
    if (typeof bindingId !== "string" || typeof idempotencyKey !== "string" || !(file instanceof File) || file.size > MAX_FACILITIES_FILE_BYTES) return Response.json({ error: "درخواست بارگذاری معتبر نیست" }, { status: 400 });
    // Ownership and programme gates run before any byte of the file is parsed, so
    // an unauthorised caller cannot drive the content verifier (ZIP/Office parsers).
    const binding = await db.facilitiesFileBinding.findFirst({ where: { id: bindingId, userId: session.subjectId, scope: "APPLICATION", application: { status: { in: FACILITIES_EDITABLE_STATUSES }, userId: session.subjectId } } });
    if (!binding) return Response.json({ error: "نوع فایل برای این مدرک معتبر نیست" }, { status: 400 });
    const programme = await db.facilitiesProgramConfiguration.findUnique({ where: { program: "FACILITIES" } });
    const isCorrection = binding.applicationId ? await db.facilitiesApplication.count({ where: { id: binding.applicationId, status: "NEEDS_EDIT" } }) : 0;
    if (!programme?.isEnabled && !isCorrection) return Response.json({ error: "نوع فایل برای این مدرک معتبر نیست" }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const verified = verifyFacilitiesUpload({ fileName: file.name, bytes });
    if (!allowed(binding.slotKey, verified.fileType)) return Response.json({ error: "نوع فایل برای این مدرک معتبر نیست" }, { status: 400 });
    const result = await storeOwnedFacilitiesFile({ userId: session.subjectId, bindingId, idempotencyKey, fileName: file.name, bytes, storage: new FilesystemFacilitiesPrivateStorage(), scanner: createFacilitiesScannerFromEnv() });
    if (result.lifecycleStatus !== "PASSED") return Response.json({ lifecycleStatus: result.lifecycleStatus, recoveryState: facilitiesUploadRecoveryState(result.lifecycleStatus), uploadId: result.uploadId, error: facilitiesUploadRecoveryMessage(result.lifecycleStatus) }, { status: result.lifecycleStatus === "UNAVAILABLE" ? 503 : 422 });
    return Response.json({ lifecycleStatus: result.lifecycleStatus, uploadId: result.uploadId });
  } catch (error) {
    if (error instanceof FacilitiesFileError) return Response.json({ error: describeFacilitiesFileError(error.code), code: error.code }, { status: 422 });
    return Response.json({ error: "بارگذاری فایل ناموفق بود؛ دوباره تلاش کنید" }, { status: 400 });
  } finally {
    release?.();
  }
}
