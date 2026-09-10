import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { afterEach, describe, expect, it } from "vitest";

import { FacilitiesFileError } from "@/lib/facilities-files/errors";
import { discardQuarantinedFacilitiesFile, stageVerifyScanPromoteFacilitiesFile } from "@/lib/facilities-files/lifecycle";
import {
  ClamdInstreamFacilitiesFileScanner,
  createFacilitiesScannerFromEnv,
  type FacilitiesFileScanner,
} from "@/lib/facilities-files/scanner";
import { FilesystemFacilitiesPrivateStorage, type FacilitiesPrivateStorage, type FacilitiesStorageKey } from "@/lib/facilities-files/storage";
import {
  MAX_FACILITIES_APPLICATION_BYTES,
  assertFacilitiesApplicationAggregateLimit,
  facilitiesContentDisposition,
  safeFacilitiesOriginalName,
  verifyFacilitiesUpload,
} from "@/lib/facilities-files/verification";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function pdf(): Buffer {
  return Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\nstartxref\n0\n%%EOF\n");
}

function compound(kind: "doc" | "xls"): Buffer {
  const value = Buffer.alloc(512);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(value);
  value.writeUInt16LE(3, 26);
  value.writeUInt16LE(0xfffe, 28);
  value.writeUInt16LE(9, 30);
  Buffer.from(kind === "doc" ? "WordDocument" : "Workbook", "utf16le").copy(value, 128);
  return value;
}

function zip(entries: Array<{ name: string; contents?: Buffer; declaredUncompressedSize?: number }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const contents = entry.contents ?? Buffer.alloc(0);
    const uncompressedSize = entry.declaredUncompressedSize ?? contents.byteLength;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(contents.byteLength, 18);
    local.writeUInt32LE(uncompressedSize, 22);
    local.writeUInt16LE(name.byteLength, 26);
    locals.push(local, name, contents);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(contents.byteLength, 20);
    central.writeUInt32LE(uncompressedSize, 24);
    central.writeUInt16LE(name.byteLength, 28);
    central.writeUInt32LE(localOffset, 42);
    centrals.push(central, name);
    localOffset += local.byteLength + name.byteLength + contents.byteLength;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.byteLength, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...locals, central, end]);
}

describe("facilities content verification", () => {
  it("uses content, not the browser MIME type, and records a bounded digest", () => {
    const verified = verifyFacilitiesUpload({ fileName: "صورت مالی.PDF", bytes: pdf() });
    expect(verified).toMatchObject({ fileType: "PDF", detectedMimeType: "application/pdf", byteSize: pdf().byteLength });
    expect(verified.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects extension/content mismatches and incomplete PDFs", () => {
    expect(() => verifyFacilitiesUpload({ fileName: "not-a-pdf.pdf", bytes: zip([{ name: "a.txt", contents: Buffer.from("a") }]) })).toThrow(FacilitiesFileError);
    expect(() => verifyFacilitiesUpload({ fileName: "incomplete.pdf", bytes: Buffer.from("%PDF-1.7\n") })).toThrow("CONTENT_TYPE_MISMATCH");
  });

  it("uses a structural Compound File parser for legacy Office files", () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["safe"]]), "Sheet1");
    const xls = XLSX.write(book, { type: "buffer", bookType: "xls" });
    expect(verifyFacilitiesUpload({ fileName: "a.xls", bytes: xls }).fileType).toBe("XLS");
    expect(() => verifyFacilitiesUpload({ fileName: "corrupt.doc", bytes: compound("doc") })).toThrow("CONTENT_CORRUPT");
  });

  it("recognizes Office ZIP containers and rejects traversal and compression-bomb metadata", () => {
    const fakeDocx = zip([
      { name: "[Content_Types].xml", contents: Buffer.from("<Types />") },
      { name: "word/document.xml", contents: Buffer.from("<document />") },
    ]);
    expect(() => verifyFacilitiesUpload({ fileName: "questionnaire.docx", bytes: fakeDocx })).toThrow("CONTENT_CORRUPT");
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["safe"]]), "Sheet1");
    const xlsx = XLSX.write(book, { type: "buffer", bookType: "xlsx" });
    expect(verifyFacilitiesUpload({ fileName: "list.xlsx", bytes: xlsx }).fileType).toBe("XLSX");
    expect(verifyFacilitiesUpload({ fileName: "evidence.zip", bytes: zip([{ name: "evidence.txt", contents: Buffer.from("x") }]) }).fileType).toBe("ZIP");
    expect(() => verifyFacilitiesUpload({ fileName: "unsafe.zip", bytes: zip([{ name: "../secret", contents: Buffer.from("x") }]) })).toThrow("ZIP_UNSAFE");
    expect(() => verifyFacilitiesUpload({ fileName: "bomb.zip", bytes: zip([{ name: "large", contents: Buffer.from("x"), declaredUncompressedSize: 151 * 1024 * 1024 }]) })).toThrow("ZIP_UNSAFE");
    const corrupt = Buffer.from(fakeDocx);
    corrupt.writeUInt32LE(0, corrupt.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])));
    expect(() => verifyFacilitiesUpload({ fileName: "corrupt.docx", bytes: corrupt })).toThrow("CONTENT_CORRUPT");
  });

  it("accepts UTF-8 CSV but rejects binary data", () => {
    expect(verifyFacilitiesUpload({ fileName: "employees.csv", bytes: Buffer.from("نام,تعداد\nالف,1\n") }).fileType).toBe("CSV");
    expect(() => verifyFacilitiesUpload({ fileName: "not.csv", bytes: Buffer.from([0, 1, 2]) })).toThrow("CONTENT_TYPE_MISMATCH");
  });

  it("bounds aggregate accounting and makes filename metadata safe for download headers", () => {
    assertFacilitiesApplicationAggregateLimit(MAX_FACILITIES_APPLICATION_BYTES - 1, 1);
    expect(() => assertFacilitiesApplicationAggregateLimit(MAX_FACILITIES_APPLICATION_BYTES, 1)).toThrow("AGGREGATE_TOO_LARGE");
    expect(safeFacilitiesOriginalName("../../report.pdf\n")).toBe("report.pdf");
    expect(facilitiesContentDisposition('a".pdf')).not.toContain('filename="a".pdf"');
  });
});

describe("facilities private filesystem storage", () => {
  it("keeps staging and ready content in separate contained roots", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "facilities-storage-"));
    temporaryRoots.push(root);
    const storage = new FilesystemFacilitiesPrivateStorage(root);
    const stagingKey = storage.createStagingKey();
    const readyKey = storage.createReadyKey();
    await storage.writeStaging(stagingKey, Buffer.from("private"));
    await expect(storage.readStaging(stagingKey)).resolves.toEqual(Buffer.from("private"));
    await expect(storage.readStaging(readyKey)).rejects.toThrow("STORAGE_KEY_INVALID");
    await storage.promote(stagingKey, readyKey);
    await expect(storage.readReady(readyKey)).resolves.toEqual(Buffer.from("private"));
    await expect(readFile(path.join(root, stagingKey))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(storage.readReady("ready/../../outside" as FacilitiesStorageKey)).rejects.toThrow("STORAGE_KEY_INVALID");
    await expect(storage.writeStaging(readyKey, Buffer.from("wrong state"))).rejects.toThrow("STORAGE_KEY_INVALID");
  });
});

describe("scan and quarantine lifecycle", () => {
  it("promotes only passing scans and leaves unavailable scans quarantined", async () => {
    const calls: Array<[string, FacilitiesStorageKey]> = [];
    const storage: FacilitiesPrivateStorage = {
      createStagingKey: () => "staging/00000000-0000-4000-8000-000000000001",
      createReadyKey: () => "ready/00000000-0000-4000-8000-000000000002",
      writeStaging: async (key) => void calls.push(["write", key]),
      promote: async (from, to) => void calls.push(["promote", `${from}:${to}` as FacilitiesStorageKey]),
      readStaging: async () => Buffer.alloc(0),
      readReady: async () => Buffer.alloc(0),
      remove: async (key) => void calls.push(["remove", key]),
    };
    const pass: FacilitiesFileScanner = { scan: async () => ({ status: "PASSED" }) };
    const ready = await stageVerifyScanPromoteFacilitiesFile({ fileName: "document.pdf", bytes: pdf(), storage, scanner: pass });
    expect(ready).toMatchObject({ scanStatus: "PASSED", quarantine: false, storageKey: "ready/00000000-0000-4000-8000-000000000002" });
    expect(calls.some(([operation]) => operation === "promote")).toBe(true);

    const unavailable: FacilitiesFileScanner = { scan: async () => ({ status: "UNAVAILABLE", reason: "SCANNER_UNAVAILABLE" }) };
    const quarantined = await stageVerifyScanPromoteFacilitiesFile({ fileName: "document.pdf", bytes: pdf(), storage, scanner: unavailable });
    expect(quarantined).toMatchObject({ scanStatus: "UNAVAILABLE", quarantine: true, storageKey: "staging/00000000-0000-4000-8000-000000000001" });
    await discardQuarantinedFacilitiesFile(storage, quarantined.storageKey);
    expect(calls.some(([operation]) => operation === "remove")).toBe(true);
  });

  it("fails closed when scanner configuration is absent or invalid", async () => {
    const unavailable = createFacilitiesScannerFromEnv({});
    await expect(unavailable.scan({ storageKey: "staging/00000000-0000-4000-8000-000000000001", byteSize: 1, sha256: "a", fileType: "PDF", bytes: Buffer.from("x") })).resolves.toMatchObject({ status: "UNAVAILABLE" });

    const invalidAdapter = new ClamdInstreamFacilitiesFileScanner({ host: "127.0.0.1", port: 0 });
    await expect(invalidAdapter.scan({ storageKey: "staging/00000000-0000-4000-8000-000000000001", byteSize: 3, sha256: "a", fileType: "PDF", bytes: Buffer.from("abc") })).resolves.toEqual({ status: "UNAVAILABLE", reason: "SCANNER_UNAVAILABLE" });
  });
});
