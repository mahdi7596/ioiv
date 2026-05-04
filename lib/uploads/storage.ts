import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { ALLOWED_UPLOAD_EXTENSIONS, MAX_UPLOAD_SIZE_BYTES } from "@/lib/validations/shared";

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

export async function storeUploadFile(input: {
  applicationId: string;
  fieldKey: string;
  file: File;
}): Promise<StoredUpload> {
  validateUploadFile(input.file);

  const extension = path.extname(input.file.name).toLowerCase();
  const generatedName = `${randomUUID()}${extension}`;
  const directory = path.join(getUploadDir(), input.applicationId, input.fieldKey);
  const storagePath = path.join(directory, generatedName);
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
