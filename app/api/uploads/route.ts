import { stageLegacyUpload } from "@/lib/uploads/candidates";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { canEditApplication } from "@/lib/application/status";
import { logger } from "@/lib/logger";
import { UPLOAD_MALWARE_MESSAGE, UPLOAD_SCAN_UNAVAILABLE_MESSAGE } from "@/lib/uploads/storage";
import { describeFacilitiesFileError, type FacilitiesFileErrorCode } from "@/lib/facilities-files/errors";
import { cleanupLegacyReplacements } from "@/lib/uploads/replace";
import { commitApplicantUpload, LegacyFileConflict, LEGACY_FILE_CONFLICT } from "@/lib/uploads/coordination";
import { INVALID_UPLOAD_REQUEST_MESSAGE, LEGACY_UPLOAD_FIELD_KEY_PATTERN, MAX_UPLOAD_SIZE_BYTES, SAFE_PATH_ID_PATTERN } from "@/lib/validations/shared";
import { admitUpload, rejectOversizedUploadRequest } from "@/lib/uploads/request-guards";

const verifierMessages = (["FILE_EMPTY", "FILE_TOO_LARGE", "UNSUPPORTED_FILENAME", "CONTENT_TYPE_MISMATCH", "CONTENT_CORRUPT", "ZIP_UNSAFE"] as FacilitiesFileErrorCode[]).map(describeFacilitiesFileError);

export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try {
    const session = await requireSession("user");
    // Both gates run before the body is buffered: the declared length bounds a
    // single request, admission bounds how many bodies are held at once.
    const oversized = rejectOversizedUploadRequest(request, MAX_UPLOAD_SIZE_BYTES);
    if (oversized) return unchangedResponse(oversized);
    const gate = admitUpload(request, session.subjectId);
    if (!gate.ok) return unchangedResponse(gate.response);
    release = gate.release;
    const formData = await request.formData();
    const applicationId = String(formData.get("applicationId") || "");
    const fieldKey = String(formData.get("fieldKey") || "");
    const file = formData.get("file");
    const rawGeneration = formData.get("generation");
    const generation = typeof rawGeneration === "string" && /^(0|[1-9][0-9]*)$/.test(rawGeneration) ? Number(rawGeneration) : NaN;

    if (
      !SAFE_PATH_ID_PATTERN.test(applicationId) ||
      !LEGACY_UPLOAD_FIELD_KEY_PATTERN.test(fieldKey) ||
      !(file instanceof File) || !Number.isSafeInteger(generation)
    ) {
      logger.warn("upload_rejected_invalid_request", { hasFile: file instanceof File });
      return Response.json({ error: INVALID_UPLOAD_REQUEST_MESSAGE, outcome: "unchanged" }, { status: 400 });
    }

    const application = await db.application.findUnique({ where: { id: applicationId } });

    if (
      !application ||
      application.userId !== session.subjectId ||
      !canEditApplication(application.status)
    ) {
      return Response.json({ error: "اجازه بارگذاری فایل برای این پرونده وجود ندارد", outcome: "unchanged" }, { status: 403 });
    }

    const stored = await stageLegacyUpload({ applicationId, fieldKey, file });
    const record = await commitApplicantUpload({ applicationId, userId: session.subjectId, fieldKey, stored, expectedGeneration: generation });
    await cleanupLegacyReplacements(applicationId, fieldKey).catch(() => undefined);

    logger.info("upload_succeeded", {
      applicationId,
      fieldKey,
      fileId: record.fileId,
      size: stored.size,
      mimeType: stored.mimeType,
    });

    return Response.json(record);
  } catch (error) {
    if (error instanceof LegacyFileConflict) return Response.json({ error: LEGACY_FILE_CONFLICT }, { status: 409 });
    logger.error("upload_failed", error);
    const message = error instanceof Error ? error.message : "";
    const knownMessages = [
      "Unauthorized",
      INVALID_UPLOAD_REQUEST_MESSAGE,
      "نوع فایل مجاز نیست",
      "حجم فایل نباید بیشتر از ۲۰ مگابایت باشد",
      UPLOAD_MALWARE_MESSAGE,
      UPLOAD_SCAN_UNAVAILABLE_MESSAGE,
      ...verifierMessages,
    ];
    const safeMessage = knownMessages.includes(message) ? message : "بارگذاری فایل ناموفق بود";
    const known = knownMessages.includes(message);
    const status = message === "Unauthorized" ? 401 : message === UPLOAD_SCAN_UNAVAILABLE_MESSAGE ? 503 : message === UPLOAD_MALWARE_MESSAGE ? 422 : known ? 400 : 500;

    return Response.json({ error: safeMessage, outcome: known ? "unchanged" : "unknown" }, { status });
  } finally {
    release?.();
  }
}

async function unchangedResponse(response: Response) {
  return Response.json({ ...await response.json(), outcome: "unchanged" }, { status: response.status, headers: response.headers });
}
