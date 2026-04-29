import { describe, expect, it } from "vitest";
import {
  applicationDraftSchema,
  finalSubmissionSchema,
} from "@/lib/validations/application";

const fileRef = { fileId: "file_1", name: "doc.pdf" };

describe("application validation", () => {
  it("requires three tax declaration rows for final submission", () => {
    const result = finalSubmissionSchema.safeParse({
      taxDeclarations: [
        { year: "1400", file: fileRef },
        { year: "1401", file: fileRef },
      ],
      financials: [],
      trialBalance: { generalLedger: fileRef, subsidiaryLedger: fileRef },
      creditReports: { company: fileRef, ceo: fileRef, boardMember: fileRef },
      acceptedTerms: true,
    });

    expect(result.success).toBe(false);
  });

  it("allows optional financial statements when empty", () => {
    const result = finalSubmissionSchema.safeParse({
      taxDeclarations: [
        { year: "1400", file: fileRef },
        { year: "1401", file: fileRef },
        { year: "1402", file: fileRef },
      ],
      financials: [],
      trialBalance: { generalLedger: fileRef, subsidiaryLedger: fileRef },
      creditReports: { company: fileRef, ceo: fileRef, boardMember: fileRef },
      acceptedTerms: true,
    });

    expect(result.success).toBe(true);
  });

  it("allows blank optional financial statement rows", () => {
    const result = finalSubmissionSchema.safeParse({
      taxDeclarations: [
        { year: "1400", file: fileRef },
        { year: "1401", file: fileRef },
        { year: "1402", file: fileRef },
      ],
      financials: [{}],
      trialBalance: { generalLedger: fileRef, subsidiaryLedger: fileRef },
      creditReports: { company: fileRef, ceo: fileRef, boardMember: fileRef },
      acceptedTerms: true,
    });

    expect(result.success).toBe(true);
  });

  it("requires year and file when optional financial row is present", () => {
    const result = finalSubmissionSchema.safeParse({
      taxDeclarations: [
        { year: "1400", file: fileRef },
        { year: "1401", file: fileRef },
        { year: "1402", file: fileRef },
      ],
      financials: [{ year: "1402" }],
      trialBalance: { generalLedger: fileRef, subsidiaryLedger: fileRef },
      creditReports: { company: fileRef, ceo: fileRef, boardMember: fileRef },
      acceptedTerms: true,
    });

    expect(result.success).toBe(false);
  });

  it("requires a year when optional financial file is uploaded", () => {
    const result = finalSubmissionSchema.safeParse({
      taxDeclarations: [
        { year: "1400", file: fileRef },
        { year: "1401", file: fileRef },
        { year: "1402", file: fileRef },
      ],
      financials: [{ file: fileRef }],
      trialBalance: { generalLedger: fileRef, subsidiaryLedger: fileRef },
      creditReports: { company: fileRef, ceo: fileRef, boardMember: fileRef },
      acceptedTerms: true,
    });

    expect(result.success).toBe(false);
  });

  it("allows draft data without requiring every final field", () => {
    expect(applicationDraftSchema.safeParse({ currentStep: 2, financials: [] }).success).toBe(
      true,
    );
  });
});
