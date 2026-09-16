import { describe, expect, it, vi } from "vitest";

import {
  assertFacilitiesProfileDocumentEditable,
  assertFacilitiesProfileEditable,
  PROFILE_DOCUMENT_LOCK_STATUSES,
  PROFILE_LOCK_STATUSES,
} from "@/lib/facilities/profile-lock";

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

describe("facilities profile document lock", () => {
  it("locks documents only while a file is actively under review — never on NEEDS_EDIT", () => {
    expect(PROFILE_DOCUMENT_LOCK_STATUSES).toEqual(["PENDING_PAYMENT", "SUBMITTED", "UNDER_REVIEW"]);
    expect(PROFILE_DOCUMENT_LOCK_STATUSES).not.toContain("NEEDS_EDIT");
  });

  it("queries only the hard-lock statuses, so a NEEDS_EDIT application does not block document upload", async () => {
    // findFirst is scoped to PROFILE_DOCUMENT_LOCK_STATUSES; a lone NEEDS_EDIT
    // application is not matched by that query and so returns null → editable.
    const client = { facilitiesApplication: { findFirst: vi.fn().mockResolvedValue(null) } };
    await expect(assertFacilitiesProfileDocumentEditable(client as never, "company_1")).resolves.toBeUndefined();
    expect(client.facilitiesApplication.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { in: PROFILE_DOCUMENT_LOCK_STATUSES } }) }),
    );
  });

  it("still rejects document upload while an application is under review", async () => {
    const client = { facilitiesApplication: { findFirst: vi.fn().mockResolvedValue({ id: "app_1" }) } };
    await expect(assertFacilitiesProfileDocumentEditable(client as never, "company_1")).rejects.toThrow("مدارک پروفایل شرکت قابل تغییر نیست");
  });
});
