import { describe, expect, it } from "vitest";
import { FACILITIES_UNAVAILABLE_RETENTION_MS, facilitiesUploadRecoveryMessage, facilitiesUploadRecoveryState, isFacilitiesUnavailableExpired } from "@/lib/facilities-files/retention";

describe("facilities unavailable retention", () => {
  it("expires at exactly 24 hours", () => {
    const created = new Date("2026-09-11T00:00:00Z");
    expect(isFacilitiesUnavailableExpired(created, new Date(created.getTime() + FACILITIES_UNAVAILABLE_RETENTION_MS - 1))).toBe(false);
    expect(isFacilitiesUnavailableExpired(created, new Date(created.getTime() + FACILITIES_UNAVAILABLE_RETENTION_MS))).toBe(true);
  });

  it("provides distinct temporary, expired, andable permanent messages", () => {
    expect(facilitiesUploadRecoveryMessage("UNAVAILABLE")).toContain("۲۴ ساعت");
    expect(facilitiesUploadRecoveryMessage("FAILED")).toContain("رد شد");
    expect(facilitiesUploadRecoveryMessage("UNAVAILABLE", true)).toContain("دوباره بارگذاری");
    expect(facilitiesUploadRecoveryState("UNAVAILABLE")).toBe("RETAINED_FOR_RETRY");
    expect(facilitiesUploadRecoveryState("UNAVAILABLE", true)).toBe("EXPIRED_REUPLOAD_REQUIRED");
    expect(facilitiesUploadRecoveryState("CORRUPT")).toBe("PERMANENT_REJECTION");
    expect(facilitiesUploadRecoveryState("PENDING")).toBe("TEMPORARY_OUTAGE");
  });
});
