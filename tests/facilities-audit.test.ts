import { describe, expect, it } from "vitest";
import { decodeFacilitiesAuditCursor, encodeFacilitiesAuditCursor, maskAuditIp, safeAuditMetadata } from "@/lib/actions/facilities-audit";

describe("facilities audit helpers", () => {
  it("round-trips stable cursors and rejects malformed values", () => {
    const value = encodeFacilitiesAuditCursor({ createdAt: "2026-09-12T00:00:00.000Z", id: "audit_1" });
    expect(decodeFacilitiesAuditCursor(value)).toEqual({ createdAt: new Date("2026-09-12T00:00:00.000Z"), id: "audit_1" });
    expect(() => decodeFacilitiesAuditCursor("bad")).toThrow("نشانگر");
  });

  it("masks protected values and strips unknown metadata", () => {
    expect(maskAuditIp("192.168.1.25")).toBe("192.168.1.xxx");
    expect(maskAuditIp("2001:db8:1:2::1")).toBe("2001:db8:1:…");
    expect(safeAuditMetadata({ recordCount: 2, storageKey: "secret", filterKeys: ["status"] })).toEqual({ recordCount: 2, filterKeys: ["status"] });
  });
});
