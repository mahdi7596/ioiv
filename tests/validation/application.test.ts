import { describe, expect, it } from "vitest";
import {
  applicationDraftSchema,
  finalSubmissionSchema,
} from "@/lib/validations/application";

const fileRef = { fileId: "file_1", name: "doc.pdf" };
const humanResources = { employeeCount: 12, insuranceList: fileRef };

describe("application validation", () => {
  it("allows one complete tax declaration row for final submission", () => {
    const result = finalSubmissionSchema.safeParse({
      taxDeclarations: [
        { year: "1400", file: fileRef },
        {},
        {},
      ],
      financials: [{ year: "1402", file: fileRef }],
      humanResources,
      trialBalance: { generalLedger: fileRef, subsidiaryLedger: fileRef },
      creditReports: { company: fileRef, ceo: fileRef, boardMember: fileRef },
      acceptedTerms: true,
    });

    expect(result.success).toBe(true);
  });

  it("requires at least one complete tax declaration row", () => {
    const result = finalSubmissionSchema.safeParse({
      taxDeclarations: [{}, {}, {}],
      financials: [{ year: "1402", file: fileRef }],
      humanResources,
      trialBalance: { generalLedger: fileRef, subsidiaryLedger: fileRef },
      creditReports: { company: fileRef, ceo: fileRef, boardMember: fileRef },
      acceptedTerms: true,
    });

    expect(result.success).toBe(false);
  });

  it("requires audited financial statements when empty", () => {
    const result = finalSubmissionSchema.safeParse({
      taxDeclarations: [{ year: "1400", file: fileRef }],
      financials: [{}],
      humanResources,
      trialBalance: { generalLedger: fileRef, subsidiaryLedger: fileRef },
      creditReports: { company: fileRef, ceo: fileRef, boardMember: fileRef },
      acceptedTerms: true,
    });

    expect(result.success).toBe(false);
  });

  it("requires year and file when financial row is present", () => {
    const result = finalSubmissionSchema.safeParse({
      taxDeclarations: [{ year: "1400", file: fileRef }],
      financials: [{ year: "1402" }],
      humanResources,
      trialBalance: { generalLedger: fileRef, subsidiaryLedger: fileRef },
      creditReports: { company: fileRef, ceo: fileRef, boardMember: fileRef },
      acceptedTerms: true,
    });

    expect(result.success).toBe(false);
  });

  it("requires a year when optional financial file is uploaded", () => {
    const result = finalSubmissionSchema.safeParse({
      taxDeclarations: [{ year: "1400", file: fileRef }],
      financials: [{ file: fileRef }],
      humanResources,
      trialBalance: { generalLedger: fileRef, subsidiaryLedger: fileRef },
      creditReports: { company: fileRef, ceo: fileRef, boardMember: fileRef },
      acceptedTerms: true,
    });

    expect(result.success).toBe(false);
  });

  it("requires positive employee count and insurance list for final submission", () => {
    const result = finalSubmissionSchema.safeParse({
      taxDeclarations: [{ year: "1400", file: fileRef }],
      financials: [{ year: "1402", file: fileRef }],
      humanResources: { employeeCount: 0 },
      trialBalance: { generalLedger: fileRef, subsidiaryLedger: fileRef },
      creditReports: { company: fileRef, ceo: fileRef, boardMember: fileRef },
      acceptedTerms: true,
    });

    expect(result.success).toBe(false);
  });

  it("allows draft data without requiring every final field", () => {
    expect(
      applicationDraftSchema.safeParse({
        currentStep: 6,
        financials: [],
        humanResources: { employeeCount: 3 },
      }).success,
    ).toBe(true);
  });
});
