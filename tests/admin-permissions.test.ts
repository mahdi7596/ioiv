import { UserRole } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { getAdminPermissions, hasAdminPermission } from "@/lib/admin/permissions";

describe("admin permissions", () => {
  it("keeps existing admin roles fully operational", () => {
    for (const role of [UserRole.ADMIN, UserRole.SUPER_ADMIN]) {
      expect(getAdminPermissions(role)).toEqual({
        viewAdminPanel: true,
        viewEntries: true,
        downloadSubmissionFiles: true,
        exportSubmissions: true,
        changeSubmissionStatus: true,
        manageValidationCertificates: true,
      });
    }
  });

  it("allows entry viewers to inspect entries without action access", () => {
    expect(getAdminPermissions(UserRole.ENTRY_VIEWER)).toEqual({
      viewAdminPanel: true,
      viewEntries: true,
      downloadSubmissionFiles: false,
      exportSubmissions: false,
      changeSubmissionStatus: false,
      manageValidationCertificates: false,
    });
  });

  it("does not grant admin access to the generic user role", () => {
    expect(hasAdminPermission(UserRole.USER, "viewAdminPanel")).toBe(false);
    expect(hasAdminPermission(UserRole.USER, "exportSubmissions")).toBe(false);
  });
});
