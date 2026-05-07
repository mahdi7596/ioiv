import { describe, expect, it } from "vitest";
import {
  formatEmployeeCount,
  humanResourcesEmployeeCountLabel,
} from "@/lib/admin/humanResources";

describe("admin human resources display", () => {
  it("formats numeric employee counts with Persian digits", () => {
    expect(formatEmployeeCount({ employeeCount: 24 })).toBe("۲۴");
  });

  it("formats ASCII and localized numeric string employee counts", () => {
    expect(formatEmployeeCount({ employeeCount: "12" })).toBe("۱۲");
    expect(formatEmployeeCount({ employeeCount: "۳۴" })).toBe("۳۴");
    expect(formatEmployeeCount({ employeeCount: "٥٦" })).toBe("۵۶");
  });

  it("renders missing marker for absent or invalid employee counts", () => {
    expect(formatEmployeeCount({})).toBe("-");
    expect(formatEmployeeCount({ employeeCount: 0 })).toBe("-");
    expect(formatEmployeeCount({ employeeCount: "abc" })).toBe("-");
  });

  it("uses the exact HR review label", () => {
    expect(humanResourcesEmployeeCountLabel).toBe(
      "تعداد نیروی انسانی بر اساس آخرین لیست بیمه",
    );
  });
});
