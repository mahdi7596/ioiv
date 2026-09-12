import { describe, expect, it, vi } from "vitest";

import { assertFacilitiesProfileEditable, PROFILE_LOCK_STATUSES } from "@/lib/facilities/profile-lock";

describe("facilities company profile lock", () => {
  it("covers every active payment, review, and correction state", () => {
    expect(PROFILE_LOCK_STATUSES).toEqual(["PENDING_PAYMENT", "SUBMITTED", "UNDER_REVIEW", "NEEDS_EDIT"]);
  });

  it("rejects profile mutation while an active facilities application exists", async () => {
    const client = { facilitiesApplication: { findFirst: vi.fn().mockResolvedValue({ id: "app_1" }) } };
    await expect(assertFacilitiesProfileEditable(client as never, "company_1")).rejects.toThrow("پروفایل شرکت قابل تغییر نیست");
    expect(client.facilitiesApplication.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: "company_1" }) }));
  });

  it("allows profile mutation when no active application exists", async () => {
    const client = { facilitiesApplication: { findFirst: vi.fn().mockResolvedValue(null) } };
    await expect(assertFacilitiesProfileEditable(client as never, "company_1")).resolves.toBeUndefined();
  });
});
