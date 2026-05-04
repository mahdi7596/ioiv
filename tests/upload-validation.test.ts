import { describe, expect, it } from "vitest";
import { validateUploadFile } from "@/lib/uploads/storage";

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
});
