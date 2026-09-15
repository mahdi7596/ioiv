import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isLegacyUploadFieldKey, storeUploadFile, validatePdfUploadFile, validateUploadFile } from "@/lib/uploads/storage";

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
    const file = new File(["%PDF-1.4"], "doc.pdf", { type: "application/pdf" });

    const stored = await storeUploadFile({ applicationId: "app-1", fieldKey: "creditReports.ceo", file });

    expect(stored.storagePath.startsWith(path.join(root, "app-1", "creditReports.ceo") + path.sep)).toBe(true);
    await expect(readdir(path.join(root, "app-1", "creditReports.ceo"))).resolves.toHaveLength(1);
  });

  it("refuses to write when the field key or application id would leave the root", async () => {
    const root = await tempRoot();
    const file = new File(["%PDF-1.4"], "doc.pdf", { type: "application/pdf" });

    await expect(storeUploadFile({ applicationId: "app-1", fieldKey: "../../escape", file })).rejects.toThrow("درخواست بارگذاری معتبر نیست");
    await expect(storeUploadFile({ applicationId: "../escape", fieldKey: "creditReports.ceo", file })).rejects.toThrow("درخواست بارگذاری معتبر نیست");
    await expect(readdir(root)).resolves.toEqual([]);
  });
});
