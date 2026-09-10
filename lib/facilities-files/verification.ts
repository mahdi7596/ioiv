import { createHash } from "node:crypto";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import * as XLSX from "xlsx";

import { FacilitiesFileError } from "@/lib/facilities-files/errors";

export const MAX_FACILITIES_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FACILITIES_APPLICATION_BYTES = 150 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 2_048;
export const MAX_ZIP_UNCOMPRESSED_BYTES = 150 * 1024 * 1024;
export const MAX_ZIP_COMPRESSION_RATIO = 100;

export type FacilitiesStoredFileType = "PDF" | "DOC" | "DOCX" | "XLS" | "XLSX" | "CSV" | "ZIP";

export type VerifiedFacilitiesFile = {
  fileType: FacilitiesStoredFileType;
  detectedMimeType: string;
  byteSize: number;
  sha256: string;
  originalName: string;
};

const extensionTypes: Record<string, FacilitiesStoredFileType> = {
  ".pdf": "PDF",
  ".doc": "DOC",
  ".docx": "DOCX",
  ".xls": "XLS",
  ".xlsx": "XLSX",
  ".csv": "CSV",
  ".zip": "ZIP",
};

const mimeTypes: Record<FacilitiesStoredFileType, string> = {
  PDF: "application/pdf",
  DOC: "application/msword",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  XLS: "application/vnd.ms-excel",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  CSV: "text/csv",
  ZIP: "application/zip",
};

/**
 * This is display metadata only. It is never a filesystem path, storage key, or
 * Content-Disposition value without further encoding.
 */
export function safeFacilitiesOriginalName(input: string): string {
  const baseName = input.replaceAll("\\", "/").split("/").at(-1) ?? "";
  const clean = baseName
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 180);

  if (!clean || clean === "." || clean === "..") {
    throw new FacilitiesFileError("UNSUPPORTED_FILENAME");
  }

  return clean;
}

export function facilitiesContentDisposition(filename: string): string {
  const safeName = safeFacilitiesOriginalName(filename);
  const fallback = safeName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "download";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}

export function assertFacilitiesApplicationAggregateLimit(existingBytes: number, incomingBytes: number): void {
  if (!Number.isSafeInteger(existingBytes) || existingBytes < 0 || !Number.isSafeInteger(incomingBytes) || incomingBytes < 0) {
    throw new FacilitiesFileError("AGGREGATE_TOO_LARGE");
  }
  if (existingBytes + incomingBytes > MAX_FACILITIES_APPLICATION_BYTES) {
    throw new FacilitiesFileError("AGGREGATE_TOO_LARGE");
  }
}

export function verifyFacilitiesUpload(input: { fileName: string; bytes: Buffer | Uint8Array }): VerifiedFacilitiesFile {
  const originalName = safeFacilitiesOriginalName(input.fileName);
  const bytes = Buffer.from(input.bytes);

  if (bytes.byteLength === 0) throw new FacilitiesFileError("FILE_EMPTY");
  if (bytes.byteLength > MAX_FACILITIES_FILE_BYTES) throw new FacilitiesFileError("FILE_TOO_LARGE");

  const extension = path.extname(originalName).toLowerCase();
  const expectedType = extensionTypes[extension];
  if (!expectedType) throw new FacilitiesFileError("UNSUPPORTED_FILENAME");

  const actualType = detectFacilitiesContentType(bytes);
  if (!actualType || actualType !== expectedType) {
    throw new FacilitiesFileError("CONTENT_TYPE_MISMATCH");
  }

  return {
    fileType: actualType,
    detectedMimeType: mimeTypes[actualType],
    byteSize: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    originalName,
  };
}

function detectFacilitiesContentType(bytes: Buffer): FacilitiesStoredFileType | null {
  if (isPdf(bytes)) return "PDF";

  const compoundType = detectCompoundDocumentType(bytes);
  if (compoundType) return compoundType;

  const zip = inspectZip(bytes);
  if (zip) {
    if (zip.names.has("[content_types].xml") && zip.names.has("word/document.xml")) {
      if (!isOfficeXml(zip, "word/document.xml", /<w:document\b/)) throw new FacilitiesFileError("CONTENT_CORRUPT");
      return "DOCX";
    }
    if (zip.names.has("[content_types].xml") && zip.names.has("xl/workbook.xml")) {
      if (!isOfficeXml(zip, "xl/workbook.xml", /<workbook\b/)) throw new FacilitiesFileError("CONTENT_CORRUPT");
      try {
        const workbook = XLSX.read(bytes, { type: "buffer", WTF: true });
        if (!workbook.SheetNames.length) throw new Error("empty workbook");
      } catch {
        throw new FacilitiesFileError("CONTENT_CORRUPT");
      }
      return "XLSX";
    }
    return "ZIP";
  }

  if (isCsv(bytes)) return "CSV";
  return null;
}

function isPdf(bytes: Buffer): boolean {
  if (bytes.byteLength < 15 || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) return false;
  // Require the bounded structural markers every non-linearized PDF has. This
  // deliberately rejects uncertain input rather than handing it to the scanner
  // as a nominal PDF; contents are never rendered by this verifier.
  const tail = bytes.subarray(Math.max(0, bytes.byteLength - 8_192));
  return tail.includes(Buffer.from("%%EOF"))
    && tail.includes(Buffer.from("startxref"))
    && tail.includes(Buffer.from("trailer"))
    && bytes.includes(Buffer.from(" obj"));
}

function detectCompoundDocumentType(bytes: Buffer): "DOC" | "XLS" | null {
  if (bytes.byteLength < 512) return null;
  if (!bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return null;
  if (bytes.readUInt16LE(28) !== 0xfffe) throw new FacilitiesFileError("CONTENT_CORRUPT");
  const majorVersion = bytes.readUInt16LE(26);
  const sectorShift = bytes.readUInt16LE(30);
  if ((majorVersion !== 3 && majorVersion !== 4) || (sectorShift !== 9 && sectorShift !== 12)) {
    throw new FacilitiesFileError("CONTENT_CORRUPT");
  }

  // SheetJS' CFB parser validates the compound allocation/directory structure;
  // magic bytes plus a string search would accept corrupt arbitrary containers.
  let entries: Array<{ name?: string }>;
  try {
    entries = XLSX.CFB.read(bytes, { type: "buffer" }).FileIndex;
  } catch {
    throw new FacilitiesFileError("CONTENT_CORRUPT");
  }
  const names = new Set(entries.map((entry) => entry.name?.toLocaleLowerCase("en-US")).filter((name): name is string => Boolean(name)));
  if (names.has("worddocument")) return "DOC";
  if (names.has("workbook") || names.has("book")) return "XLS";
  throw new FacilitiesFileError("CONTENT_CORRUPT");
}

type ZipInspection = { names: Set<string>; entries: Map<string, { compressionMethod: number; data: Buffer }> };

/** Parses ZIP metadata only; files are not extracted or evaluated. */
function inspectZip(bytes: Buffer): ZipInspection | null {
  const eocd = findEndOfCentralDirectory(bytes);
  if (eocd === -1) return null;
  if (eocd + 22 > bytes.byteLength) throw new FacilitiesFileError("CONTENT_CORRUPT");

  const diskNumber = bytes.readUInt16LE(eocd + 4);
  const centralDirectoryDisk = bytes.readUInt16LE(eocd + 6);
  const entriesOnDisk = bytes.readUInt16LE(eocd + 8);
  const entries = bytes.readUInt16LE(eocd + 10);
  const centralDirectorySize = bytes.readUInt32LE(eocd + 12);
  const centralDirectoryOffset = bytes.readUInt32LE(eocd + 16);
  const commentLength = bytes.readUInt16LE(eocd + 20);
  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entriesOnDisk !== entries ||
    entries > MAX_ZIP_ENTRIES ||
    eocd + 22 + commentLength !== bytes.byteLength ||
    centralDirectoryOffset + centralDirectorySize > eocd
  ) {
    throw new FacilitiesFileError("ZIP_UNSAFE");
  }

  const names = new Set<string>();
  const entryData = new Map<string, { compressionMethod: number; data: Buffer }>();
  let offset = centralDirectoryOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > bytes.byteLength || bytes.readUInt32LE(offset) !== 0x02014b50) {
      throw new FacilitiesFileError("CONTENT_CORRUPT");
    }
    const flags = bytes.readUInt16LE(offset + 8);
    const compressionMethod = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const entryCommentLength = bytes.readUInt16LE(offset + 32);
    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    const entryEnd = offset + 46 + nameLength + extraLength + entryCommentLength;
    if (entryEnd > bytes.byteLength || (flags & 0x1) !== 0 || (compressionMethod !== 0 && compressionMethod !== 8)) {
      throw new FacilitiesFileError("ZIP_UNSAFE");
    }

    const name = decodeZipName(bytes.subarray(offset + 46, offset + 46 + nameLength));
    assertSafeZipPath(name);
    const normalizedName = name.toLocaleLowerCase("en-US");
    if (names.has(normalizedName)) throw new FacilitiesFileError("ZIP_UNSAFE");
    names.add(normalizedName);

    totalUncompressed += uncompressedSize;
    if (
      !Number.isSafeInteger(totalUncompressed) ||
      totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES ||
      (compressedSize === 0 && uncompressedSize > 0) ||
      (compressedSize > 0 && uncompressedSize / compressedSize > MAX_ZIP_COMPRESSION_RATIO)
    ) {
      throw new FacilitiesFileError("ZIP_UNSAFE");
    }
    const dataStart = assertSafeLocalZipHeader(bytes, localHeaderOffset, flags, compressionMethod, name, compressedSize, eocd);
    entryData.set(normalizedName, { compressionMethod, data: bytes.subarray(dataStart, dataStart + compressedSize) });
    offset = entryEnd;
  }
  if (offset !== centralDirectoryOffset + centralDirectorySize) throw new FacilitiesFileError("CONTENT_CORRUPT");
  return { names, entries: entryData };
}

function findEndOfCentralDirectory(bytes: Buffer): number {
  const lowerBound = Math.max(0, bytes.byteLength - 65_557);
  for (let offset = bytes.byteLength - 22; offset >= lowerBound; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function decodeZipName(bytes: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new FacilitiesFileError("ZIP_UNSAFE");
  }
}

function assertSafeZipPath(name: string): void {
  if (!name || name.length > 512 || name.includes("\\") || name.startsWith("/") || name.includes("\u0000")) {
    throw new FacilitiesFileError("ZIP_UNSAFE");
  }
  const segments = name.split("/");
  if (segments.some((segment) => segment === "." || segment === ".." || /[\u0000-\u001f\u007f]/.test(segment))) {
    throw new FacilitiesFileError("ZIP_UNSAFE");
  }
}

function assertSafeLocalZipHeader(
  bytes: Buffer,
  offset: number,
  flags: number,
  compressionMethod: number,
  centralName: string,
  compressedSize: number,
  centralDirectoryOffset: number,
): number {
  if (offset + 30 > centralDirectoryOffset || bytes.readUInt32LE(offset) !== 0x04034b50) {
    throw new FacilitiesFileError("CONTENT_CORRUPT");
  }
  if (bytes.readUInt16LE(offset + 6) !== flags || bytes.readUInt16LE(offset + 8) !== compressionMethod) {
    throw new FacilitiesFileError("CONTENT_CORRUPT");
  }
  const nameLength = bytes.readUInt16LE(offset + 26);
  const extraLength = bytes.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  if (dataStart + compressedSize > centralDirectoryOffset) throw new FacilitiesFileError("CONTENT_CORRUPT");
  if (decodeZipName(bytes.subarray(offset + 30, offset + 30 + nameLength)) !== centralName) {
    throw new FacilitiesFileError("CONTENT_CORRUPT");
  }
  return dataStart;
}

function isOfficeXml(zip: ZipInspection, name: string, root: RegExp): boolean {
  const contentTypes = readZipText(zip, "[content_types].xml");
  const document = readZipText(zip, name);
  return /<Types\b/.test(contentTypes) && root.test(document);
}

function readZipText(zip: ZipInspection, name: string): string {
  const entry = zip.entries.get(name);
  if (!entry) throw new FacilitiesFileError("CONTENT_CORRUPT");
  try {
    const bytes = entry.compressionMethod === 8
      ? inflateRawSync(entry.data, { maxOutputLength: 1024 * 1024 })
      : entry.data;
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new FacilitiesFileError("CONTENT_CORRUPT");
  }
}

function isCsv(bytes: Buffer): boolean {
  try {
    const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return value.length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
  } catch {
    return false;
  }
}
