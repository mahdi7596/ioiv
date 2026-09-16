import { getClientIp } from "@/lib/http/client-ip";
import { logger } from "@/lib/logger";
import { UPLOAD_RATE_LIMIT_MESSAGES, uploadRateLimiter, type UploadAdmission } from "@/lib/uploads/rate-limit";

/** Multipart framing and text fields on top of the largest accepted file. */
export const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

export const REQUEST_TOO_LARGE_MESSAGE = "حجم درخواست بارگذاری بیش از حد مجاز است.";

/**
 * `request.formData()` buffers the entire body before any application check can
 * run, so the declared length is the only bound the app can apply beforehand
 * (nginx's `client_max_body_size` is the other). A body without a declared
 * length is left to nginx: browsers always send Content-Length for FormData.
 */
export function rejectOversizedUploadRequest(request: Request, maxFileBytes: number): Response | null {
  const declared = request.headers.get("content-length");
  if (declared === null) return null;
  const length = Number(declared);
  if (!Number.isFinite(length) || length < 0) {
    return Response.json({ error: REQUEST_TOO_LARGE_MESSAGE }, { status: 400 });
  }
  if (length > maxFileBytes + MULTIPART_OVERHEAD_BYTES) {
    logger.warn("upload_request_too_large", { declaredBytes: length, limitBytes: maxFileBytes + MULTIPART_OVERHEAD_BYTES });
    return Response.json({ error: REQUEST_TOO_LARGE_MESSAGE }, { status: 413 });
  }
  return null;
}

export type UploadGate =
  | { ok: true; release: () => void }
  | { ok: false; response: Response };

/**
 * Admission for one authenticated upload: call after the session check and
 * before `formData()`; release in `finally`. Denials are 429 so the client
 * treats them as "retry later", never as a rejected file.
 */
export function admitUpload(request: Request, subjectId: string, limiter = uploadRateLimiter): UploadGate {
  const clientIp = getClientIp(request.headers);
  const admission: UploadAdmission = limiter.admit({ subjectId, clientIp });
  if (admission.ok) return admission;
  logger.warn("upload_rate_limited", { reason: admission.reason, subjectId, clientIp });
  return {
    ok: false,
    response: Response.json({ error: UPLOAD_RATE_LIMIT_MESSAGES[admission.reason], code: admission.reason }, { status: 429, headers: { "Retry-After": "60" } }),
  };
}
