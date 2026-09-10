import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { checkFacilitiesSubmissionReadiness } from "@/lib/facilities/submission";

function application(overrides: Record<string, unknown> = {}): Parameters<typeof checkFacilitiesSubmissionReadiness>[0] {
  return {
    requestedAmountRial: new Prisma.Decimal(0),
    maximumAmountRialSnapshot: new Prisma.Decimal(500000000000),
    paymentEnabledSnapshot: false,
    paymentAmountTomanSnapshot: null,
    facilityType: "FIXED_CAPITAL",
    companySnapshot: { name: "شرکت", nationalId: "۱۲۳۴۵۶۷۸۹۰۱", registrationNumber: "۱", registrationPlace: "تهران", registrationDate: new Date(), registeredCapitalRial: new Prisma.Decimal(1), contactFullName: "نماینده", contactNationalCode: "۱۲۳۴۵۶۷۸۹۰" },
    shareholders: [{ fullName: "سهامدار", ownershipPercentage: new Prisma.Decimal(100) }],
    officers: [{ id: "ceo", fullName: "مدیرعامل", position: "مدیرعامل", isChiefExecutive: true }, { id: "board", fullName: "عضو", position: "عضو", isChiefExecutive: false }],
    fileBindings: [],
    evidence: [],
    payments: [],
    ...overrides,
  } as unknown as Parameters<typeof checkFacilitiesSubmissionReadiness>[0];
}

describe("facilities submission validation", () => {
  it("rejects a profile whose shareholder total is not exactly 100 percent", () => {
    const result = checkFacilitiesSubmissionReadiness(application({ shareholders: [{ fullName: "سهامدار", ownershipPercentage: new Prisma.Decimal("99.9") }] }), { employeeCount: 0, boardOfficerId: "board" });
    expect(result.ready).toBe(false);
    expect(result.issues).toContain("درصد مالکیت سهامداران باید دقیقاً ۱۰۰ درصد باشد");
  });

  it("requires every scanned application document and at least one tax and financial year", () => {
    const result = checkFacilitiesSubmissionReadiness(application(), { employeeCount: 0, boardOfficerId: "board" });
    expect(result.ready).toBe(false);
    expect(result.issues).toContain("حداقل یک اظهارنامه مالیاتی کامل لازم است");
    expect(result.issues).toContain("حداقل یک صورت مالی حسابرسی‌شده کامل لازم است");
    expect(result.issues.some((issue) => issue.includes("questionnaire"))).toBe(true);
  });
});
