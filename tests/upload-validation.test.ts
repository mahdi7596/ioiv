import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnavailableFacilitiesFileScanner, type FacilitiesFileScanner } from "@/lib/facilities-files/scanner";
import { UPLOAD_MALWARE_MESSAGE, UPLOAD_SCAN_UNAVAILABLE_MESSAGE, isLegacyUploadFieldKey, storeUploadFile, validatePdfUploadFile, validateUploadFile, verifyLegacyUploadContent } from "@/lib/uploads/storage";

const PDF_BYTES = "%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\nstartxref\n0\n%%EOF\n";
const passingScanner: FacilitiesFileScanner = { scan: async () => ({ status: "PASSED" }) };

describe("upload validation", () => {
  it("allows Excel insurance-list style uploads", () => {
    const file = new File(["employee list"], "insurance-list.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    expect(() => validateUploadFile(file)).not.toThrow();
  });

  it("allows CSV spreadsheet uploads", () => {
    const file = new File(["name,count"], "insurance-list.csv", {
      type: "text/csv",
    });

    expect(() => validateUploadFile(file)).not.toThrow();
  });

  it("allows PDF validation certificates", () => {
    const file = new File(["certificate"], "certificate.pdf", {
      type: "application/pdf",
    });

    expect(() => validatePdfUploadFile(file)).not.toThrow();
  });

  it("rejects non-PDF validation certificates", () => {
    const file = new File(["certificate"], "certificate.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    expect(() => validatePdfUploadFile(file)).toThrow("فقط فایل PDF برای گواهی قابل بارگذاری است");
  });
});

describe("upload storage path safety", () => {
  const roots: string[] = [];

  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function tempRoot() {
    const root = await mkdtemp(path.join(os.tmpdir(), "sana-uploads-"));
    roots.push(root);
    vi.stubEnv("UPLOAD_DIR", root);
    return root;
  }

  it("accepts wizard field keys and the admin certificate key only", () => {
    expect(isLegacyUploadFieldKey("taxDeclarations.0.file")).toBe(true);
    expect(isLegacyUploadFieldKey("creditReports.boardMember")).toBe(true);
    expect(isLegacyUploadFieldKey("validationCertificate")).toBe(true);
    expect(isLegacyUploadFieldKey("../../etc")).toBe(false);
    expect(isLegacyUploadFieldKey("taxDeclarations.0.file/../../x")).toBe(false);
    expect(isLegacyUploadFieldKey("")).toBe(false);
  });

  it("writes accepted uploads beneath the upload root", async () => {
    const root = await tempRoot();
    const file = new File([PDF_BYTES], "doc.pdf", { type: "text/html" });

    const stored = await storeUploadFile({ applicationId: "app-1", fieldKey: "creditReports.ceo", file, scanner: passingScanner });

    expect(stored.storagePath.startsWith(path.join(root, "app-1", "creditReports.ceo") + path.sep)).toBe(true);
    // The browser-declared type is ignored; the stored type comes from the bytes.
    expect(stored.mimeType).toBe("application/pdf");
    await expect(readdir(path.join(root, "app-1", "creditReports.ceo"))).resolves.toHaveLength(1);
  });

  it("refuses to write when the field key or application id would leave the root", async () => {
    const root = await tempRoot();
    const file = new File([PDF_BYTES], "doc.pdf", { type: "application/pdf" });

    await expect(storeUploadFile({ applicationId: "app-1", fieldKey: "../../escape", file, scanner: passingScanner })).rejects.toThrow("درخواست بارگذاری معتبر نیست");
    await expect(storeUploadFile({ applicationId: "../escape", fieldKey: "creditReports.ceo", file, scanner: passingScanner })).rejects.toThrow("درخواست بارگذاری معتبر نیست");
    await expect(readdir(root)).resolves.toEqual([]);
  });
});

describe("legacy upload content verification", () => {
  it("verifies bytes against the extension and reports the detected type", () => {
    expect(verifyLegacyUploadContent("a.pdf", Buffer.from(PDF_BYTES))).toMatchObject({ fileType: "PDF", detectedMimeType: "application/pdf" });
    expect(() => verifyLegacyUploadContent("a.pdf", Buffer.from("PK\u0003\u0004 not a pdf"))).toThrow("محتوای فایل با پسوند آن مطابقت ندارد");
    expect(() => verifyLegacyUploadContent("a.docx", Buffer.from("plain text pretending"))).toThrow("محتوای فایل با پسوند آن مطابقت ندارد");
  });

  it("accepts Windows-1256 CSV text but rejects binary disguised as CSV", () => {
    const cp1256 = Buffer.from([0xc7, 0xd3, 0xe3, 0x2c, 0x31, 0x32, 0x0a]);
    expect(verifyLegacyUploadContent("list.csv", cp1256)).toMatchObject({ fileType: "CSV", detectedMimeType: "text/csv" });
    expect(() => verifyLegacyUploadContent("list.csv", Buffer.from([0x41, 0x00, 0x42]))).toThrow("فایل خراب است");
    expect(() => verifyLegacyUploadContent("list.csv", Buffer.alloc(0))).toThrow("فایل خراب است");
  });

  it("requires certificate uploads to be real PDFs", () => {
    expect(() => verifyLegacyUploadContent("cert.pdf", Buffer.from("hello"), true)).toThrow("محتوای فایل با پسوند آن مطابقت ندارد");
  });
});

describe("legacy upload scanning", () => {
  const roots: string[] = [];

  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function tempRoot() {
    const root = await mkdtemp(path.join(os.tmpdir(), "sana-uploads-"));
    roots.push(root);
    vi.stubEnv("UPLOAD_DIR", root);
    return root;
  }

  const file = () => new File([PDF_BYTES], "doc.pdf", { type: "application/pdf" });

  it("rejects files the configured scanner flags or cannot scan, writing nothing", async () => {
    const root = await tempRoot();
    const flagged: FacilitiesFileScanner = { scan: async () => ({ status: "FAILED", reason: "MALWARE_DETECTED" }) };
    const down: FacilitiesFileScanner = { scan: async () => ({ status: "UNAVAILABLE", reason: "SCANNER_UNAVAILABLE" }) };

    await expect(storeUploadFile({ applicationId: "app-1", fieldKey: "creditReports.ceo", file: file(), scanner: flagged })).rejects.toThrow(UPLOAD_MALWARE_MESSAGE);
    await expect(storeUploadFile({ applicationId: "app-1", fieldKey: "creditReports.ceo", file: file(), scanner: down })).rejects.toThrow(UPLOAD_SCAN_UNAVAILABLE_MESSAGE);
    await expect(readdir(root)).resolves.toEqual([]);
  });

  it("fails closed when no scanner is configured at all, and scans when one is", async () => {
    const root = await tempRoot();
    const scanned = vi.fn();
    const passthrough: FacilitiesFileScanner = { scan: async (request) => { scanned(request.fileType); return { status: "PASSED" }; } };

    await expect(storeUploadFile({ applicationId: "app-1", fieldKey: "creditReports.ceo", file: file(), scanner: new UnavailableFacilitiesFileScanner() })).rejects.toThrow(UPLOAD_SCAN_UNAVAILABLE_MESSAGE);
    await expect(readdir(root)).resolves.toEqual([]);
    await expect(storeUploadFile({ applicationId: "app-1", fieldKey: "creditReports.ceo", file: file(), scanner: passthrough })).resolves.toMatchObject({ mimeType: "application/pdf" });
    expect(scanned).toHaveBeenCalledWith("PDF");
  });
});
