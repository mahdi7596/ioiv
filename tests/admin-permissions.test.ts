import { UserRole } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { getAdminPermissions, hasAdminPermission } from "@/lib/admin/permissions";

describe("admin permissions", () => {
  it("keeps existing admin roles fully operational", () => {
    expect(getAdminPermissions(UserRole.ADMIN)).toEqual({
        viewAdminPanel: true,
        viewEntries: true,
        downloadSubmissionFiles: true,
        exportSubmissions: true,
        changeSubmissionStatus: true,
        manageValidationCertificates: true,
        viewFacilitiesEntries: true,
        downloadFacilitiesFiles: true,
        changeFacilitiesStatus: true,
        exportFacilitiesApplications: true,
        viewFacilitiesAudit: false,
      });
    expect(getAdminPermissions(UserRole.SUPER_ADMIN)).toEqual({ ...getAdminPermissions(UserRole.ADMIN), viewFacilitiesAudit: true });
  });

  it("allows entry viewers to inspect entries without action access", () => {
    expect(getAdminPermissions(UserRole.ENTRY_VIEWER)).toEqual({
      viewAdminPanel: true,
      viewEntries: true,
      downloadSubmissionFiles: false,
      exportSubmissions: false,
      changeSubmissionStatus: false,
      manageValidationCertificates: false,
      viewFacilitiesEntries: true,
      downloadFacilitiesFiles: false,
      changeFacilitiesStatus: false,
      exportFacilitiesApplications: false,
      viewFacilitiesAudit: false,
    });
  });

  it("does not grant admin access to the generic user role", () => {
    expect(hasAdminPermission(UserRole.USER, "viewAdminPanel")).toBe(false);
    expect(hasAdminPermission(UserRole.USER, "exportSubmissions")).toBe(false);
  });
});
