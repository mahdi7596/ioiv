import { replaceValidationCertificate } from "@/lib/actions/admin";
import { ActionError } from "@/lib/actions/auth";
import { logger } from "@/lib/logger";
import { requireActiveAdmin } from "@/lib/admin/require-admin";
import { rejectOversizedUploadRequest } from "@/lib/uploads/request-guards";
import { MAX_UPLOAD_SIZE_BYTES } from "@/lib/validations/shared";

/**
 * Route handler rather than a direct server action call so the upload is not
 * subject to the 1 MB server-action body limit (certificates may be 20 MB).
 */
export async function POST(request: Request) {
  try {
    const oversized = rejectOversizedUploadRequest(request, MAX_UPLOAD_SIZE_BYTES);
    if (oversized) return oversized;
    // Authenticate before buffering the multipart body; the action re-checks.
    await requireActiveAdmin("manageValidationCertificates");
    const formData = await request.formData();
    await replaceValidationCertificate(formData);

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ActionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    logger.error("api_admin_certificate_replace_failed", error);
    return Response.json({ error: "خطای غیرمنتظره رخ داد" }, { status: 500 });
  }
}
