import { describe, expect, it } from "vitest";
import { validatePdfUploadFile, validateUploadFile } from "@/lib/uploads/storage";

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
