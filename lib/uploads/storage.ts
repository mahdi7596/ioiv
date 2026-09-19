import path from "node:path";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { VALIDATION_CERTIFICATE_FIELD_KEY } from "@/lib/application/certificate";
import { FacilitiesFileError, describeFacilitiesFileError } from "@/lib/facilities-files/errors";
import { UnavailableFacilitiesFileScanner, createFacilitiesScannerFromEnv, type FacilitiesFileScanner } from "@/lib/facilities-files/scanner";
import { verifyFacilitiesUpload, type FacilitiesStoredFileType } from "@/lib/facilities-files/verification";
import { logger } from "@/lib/logger";
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  INVALID_UPLOAD_REQUEST_MESSAGE,
  LEGACY_UPLOAD_FIELD_KEY_PATTERN,
  MAX_UPLOAD_SIZE_BYTES,
  SAFE_PATH_ID_PATTERN,
} from "@/lib/validations/shared";

export const UPLOAD_MALWARE_MESSAGE = "فایل در بررسی امنیتی رد شد و قابل بارگذاری نیست";
export const UPLOAD_SCAN_UNAVAILABLE_MESSAGE = "بررسی امنیتی فایل موقتاً در دسترس نیست؛ کمی بعد دوباره تلاش کنید";

export type StoredUpload = {
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  sha256?: string;
  scanVerdict?: string;
  verifiedAt?: Date;
  candidateId?: string;
};

export function getUploadDir() {
  return process.env.UPLOAD_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "uploads");
}

export function isLegacyUploadFieldKey(fieldKey: string) {
  return LEGACY_UPLOAD_FIELD_KEY_PATTERN.test(fieldKey) || fieldKey === VALIDATION_CERTIFICATE_FIELD_KEY;
}

/**
 * Cheap pre-checks on the browser-supplied metadata. The declared MIME type is
 * not consulted: the file's bytes are verified in `storeUploadFile`.
 */
export function validateUploadFile(file: File) {
  const extension = path.extname(file.name).toLowerCase();

  if (!ALLOWED_UPLOAD_EXTENSIONS.includes(extension as (typeof ALLOWED_UPLOAD_EXTENSIONS)[number])) {
    throw new Error("نوع فایل مجاز نیست");
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error("حجم فایل نباید بیشتر از ۲۰ مگابایت باشد");
  }
}

export function validatePdfUploadFile(file: File) {
  const extension = path.extname(file.name).toLowerCase();

  if (extension !== ".pdf") {
    throw new Error("فقط فایل PDF برای گواهی قابل بارگذاری است");
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error("حجم فایل نباید بیشتر از ۲۰ مگابایت باشد");
  }
}

type VerifiedLegacyUpload = { fileType: FacilitiesStoredFileType; detectedMimeType: string; sha256: string };

/**
 * Content verification shared with the facilities pipeline. CSV is the one
 * exception: the facilities verifier requires UTF-8, but insurance lists saved
 * from Persian Excel are frequently Windows-1256, so CSV only has to be
 * non-empty text without NUL bytes.
 */
export function verifyLegacyUploadContent(fileName: string, bytes: Buffer, pdfOnly = false): VerifiedLegacyUpload {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".csv" && !pdfOnly) {
    if (bytes.byteLength === 0 || bytes.includes(0)) throw new Error(describeFacilitiesFileError("CONTENT_CORRUPT"));
    return { fileType: "CSV", detectedMimeType: "text/csv", sha256: sha256Of(bytes) };
  }

  try {
    const verified = verifyFacilitiesUpload({ fileName, bytes });
    if (pdfOnly && verified.fileType !== "PDF") throw new Error("فقط فایل PDF برای گواهی قابل بارگذاری است");
    return { fileType: verified.fileType, detectedMimeType: verified.detectedMimeType, sha256: verified.sha256 };
  } catch (error) {
    if (error instanceof FacilitiesFileError) throw new Error(describeFacilitiesFileError(error.code));
    throw error;
  }
}

function sha256Of(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Fail closed, exactly like the facilities pipeline: a missing, misconfigured,
 * flagged, or unreachable scanner rejects the upload. Unscanned documents must
 * never reach the admin download route.
 */
async function scanLegacyUpload(bytes: Buffer, verified: VerifiedLegacyUpload, scanner: FacilitiesFileScanner) {
  if (scanner instanceof UnavailableFacilitiesFileScanner) {
    logger.error("legacy_upload_scanner_not_configured", undefined, { fileType: verified.fileType, size: bytes.byteLength });
    throw new Error(UPLOAD_SCAN_UNAVAILABLE_MESSAGE);
  }

  const result = await scanner.scan({
    storageKey: `staging/${randomUUID()}`,
    byteSize: bytes.byteLength,
    sha256: verified.sha256,
    fileType: verified.fileType,
    bytes,
  });
  if (result.status === "PASSED") return;

  logger.warn("legacy_upload_scan_rejected", { status: result.status, reason: result.reason, fileType: verified.fileType, size: bytes.byteLength });
  throw new Error(result.status === "FAILED" ? UPLOAD_MALWARE_MESSAGE : UPLOAD_SCAN_UNAVAILABLE_MESSAGE);
}

export async function storeUploadFile(input: {
  applicationId: string;
  fieldKey: string;
  file: File;
  pdfOnly?: boolean;
  scanner?: FacilitiesFileScanner;
  beforeWrite?: (storagePath: string) => Promise<void>;
}): Promise<StoredUpload> {
  if (input.pdfOnly) {
    validatePdfUploadFile(input.file);
  } else {
    validateUploadFile(input.file);
  }

  if (!SAFE_PATH_ID_PATTERN.test(input.applicationId) || !isLegacyUploadFieldKey(input.fieldKey)) {
    throw new Error(INVALID_UPLOAD_REQUEST_MESSAGE);
  }

  const extension = path.extname(input.file.name).toLowerCase();
  const generatedName = `${randomUUID()}${extension}`;
  await mkdir(path.resolve(getUploadDir()), { recursive: true, mode: 0o700 });
  const root = await realpath(path.resolve(getUploadDir()));
  const directory = path.resolve(root, input.applicationId, input.fieldKey);
  const storagePath = path.join(directory, generatedName);
  // Defence in depth: the key patterns above already exclude separators, but
  // never write outside the upload root even if they are loosened later.
  if (!storagePath.startsWith(root + path.sep)) {
    throw new Error(INVALID_UPLOAD_REQUEST_MESSAGE);
  }

  const bytes = Buffer.from(await input.file.arrayBuffer());
  const verified = verifyLegacyUploadContent(input.file.name, bytes, input.pdfOnly);
  await scanLegacyUpload(bytes, verified, input.scanner ?? createFacilitiesScannerFromEnv());

  await input.beforeWrite?.(storagePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(storagePath, bytes, { flag: "wx", mode: 0o600 });

  return {
    originalName: input.file.name,
    mimeType: verified.detectedMimeType,
    size: input.file.size,
    storagePath,
    sha256: verified.sha256,
    scanVerdict: "PASSED",
    verifiedAt: new Date(),
  };
}
