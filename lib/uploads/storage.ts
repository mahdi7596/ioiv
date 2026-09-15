import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { VALIDATION_CERTIFICATE_FIELD_KEY } from "@/lib/application/certificate";
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  INVALID_UPLOAD_REQUEST_MESSAGE,
  LEGACY_UPLOAD_FIELD_KEY_PATTERN,
  MAX_UPLOAD_SIZE_BYTES,
  SAFE_PATH_ID_PATTERN,
} from "@/lib/validations/shared";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/csv",
  "application/octet-stream",
]);

export type StoredUpload = {
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
};

export function getUploadDir() {
  return process.env.UPLOAD_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "uploads");
}

export function isLegacyUploadFieldKey(fieldKey: string) {
  return LEGACY_UPLOAD_FIELD_KEY_PATTERN.test(fieldKey) || fieldKey === VALIDATION_CERTIFICATE_FIELD_KEY;
}

export function validateUploadFile(file: File) {
  const extension = path.extname(file.name).toLowerCase();

  if (!ALLOWED_UPLOAD_EXTENSIONS.includes(extension as (typeof ALLOWED_UPLOAD_EXTENSIONS)[number])) {
    throw new Error("نوع فایل مجاز نیست");
  }

  if (!ALLOWED_MIME_TYPES.has(file.type || "application/octet-stream")) {
    throw new Error("نوع فایل مجاز نیست");
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error("حجم فایل نباید بیشتر از ۲۰ مگابایت باشد");
  }
}

export function validatePdfUploadFile(file: File) {
  const extension = path.extname(file.name).toLowerCase();

  if (extension !== ".pdf" || file.type !== "application/pdf") {
    throw new Error("فقط فایل PDF برای گواهی قابل بارگذاری است");
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error("حجم فایل نباید بیشتر از ۲۰ مگابایت باشد");
  }
}

export async function storeUploadFile(input: {
  applicationId: string;
  fieldKey: string;
  file: File;
  pdfOnly?: boolean;
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
  const root = path.resolve(getUploadDir());
  const directory = path.resolve(root, input.applicationId, input.fieldKey);
  const storagePath = path.join(directory, generatedName);
  // Defence in depth: the key patterns above already exclude separators, but
  // never write outside the upload root even if they are loosened later.
  if (!storagePath.startsWith(root + path.sep)) {
    throw new Error(INVALID_UPLOAD_REQUEST_MESSAGE);
  }
  const bytes = Buffer.from(await input.file.arrayBuffer());

  await mkdir(directory, { recursive: true });
  await writeFile(storagePath, bytes);

  return {
    originalName: input.file.name,
    mimeType: input.file.type || "application/octet-stream",
    size: input.file.size,
    storagePath,
  };
}
