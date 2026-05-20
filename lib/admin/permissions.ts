import { UserRole } from "@prisma/client";

export type AdminPermission =
  | "viewAdminPanel"
  | "viewEntries"
  | "downloadSubmissionFiles"
  | "exportSubmissions"
  | "changeSubmissionStatus"
  | "manageValidationCertificates";

export type AdminPermissions = Record<AdminPermission, boolean>;

const noAdminPermissions: AdminPermissions = {
  viewAdminPanel: false,
  viewEntries: false,
  downloadSubmissionFiles: false,
  exportSubmissions: false,
  changeSubmissionStatus: false,
  manageValidationCertificates: false,
};

const fullAdminPermissions: AdminPermissions = {
  viewAdminPanel: true,
  viewEntries: true,
  downloadSubmissionFiles: true,
  exportSubmissions: true,
  changeSubmissionStatus: true,
  manageValidationCertificates: true,
};

const entryViewerPermissions: AdminPermissions = {
  viewAdminPanel: true,
  viewEntries: true,
  downloadSubmissionFiles: false,
  exportSubmissions: false,
  changeSubmissionStatus: false,
  manageValidationCertificates: false,
};

export const adminRolePermissions: Record<UserRole, AdminPermissions> = {
  [UserRole.USER]: noAdminPermissions,
  [UserRole.ADMIN]: fullAdminPermissions,
  [UserRole.SUPER_ADMIN]: fullAdminPermissions,
  [UserRole.ENTRY_VIEWER]: entryViewerPermissions,
};

export function getAdminPermissions(role: UserRole): AdminPermissions {
  return adminRolePermissions[role] ?? noAdminPermissions;
}

export function hasAdminPermission(role: UserRole, permission: AdminPermission) {
  return getAdminPermissions(role)[permission];
}
