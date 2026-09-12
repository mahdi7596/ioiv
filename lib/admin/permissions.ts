import { UserRole } from "@prisma/client";

export type AdminPermission =
  | "viewAdminPanel"
  | "viewEntries"
  | "downloadSubmissionFiles"
  | "exportSubmissions"
  | "changeSubmissionStatus"
  | "manageValidationCertificates"
  | "viewFacilitiesEntries"
  | "downloadFacilitiesFiles"
  | "changeFacilitiesStatus"
  | "exportFacilitiesApplications"
  | "viewFacilitiesAudit";

export type AdminPermissions = Record<AdminPermission, boolean>;

const noAdminPermissions: AdminPermissions = {
  viewAdminPanel: false,
  viewEntries: false,
  downloadSubmissionFiles: false,
  exportSubmissions: false,
  changeSubmissionStatus: false,
  manageValidationCertificates: false,
  viewFacilitiesEntries: false,
  downloadFacilitiesFiles: false,
  changeFacilitiesStatus: false,
  exportFacilitiesApplications: false,
  viewFacilitiesAudit: false,
};

const fullAdminPermissions: AdminPermissions = {
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
};

const entryViewerPermissions: AdminPermissions = {
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
};

export const adminRolePermissions: Record<UserRole, AdminPermissions> = {
  [UserRole.USER]: noAdminPermissions,
  [UserRole.ADMIN]: fullAdminPermissions,
  [UserRole.SUPER_ADMIN]: { ...fullAdminPermissions, viewFacilitiesAudit: true },
  [UserRole.ENTRY_VIEWER]: entryViewerPermissions,
};

export function getAdminPermissions(role: UserRole): AdminPermissions {
  return adminRolePermissions[role] ?? noAdminPermissions;
}

export function hasAdminPermission(role: UserRole, permission: AdminPermission) {
  return getAdminPermissions(role)[permission];
}
