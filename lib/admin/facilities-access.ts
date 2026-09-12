import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { getAdminPermissions, hasAdminPermission, type AdminPermission } from "@/lib/admin/permissions";
import { ActionError } from "@/lib/actions/auth";

export async function requireFacilitiesAdmin(permission: AdminPermission = "viewFacilitiesEntries") {
  const session = await requireSession("admin");
  const admin = await db.admin.findUnique({ where: { id: session.subjectId } });
  if (!admin?.active) throw new ActionError("دسترسی مدیریت فعال نیست", 403);
  if (!hasAdminPermission(admin.role, permission)) throw new ActionError("برای این عملیات دسترسی لازم را ندارید", 403);
  return admin;
}

export async function getFacilitiesAdminAccess() {
  const admin = await requireFacilitiesAdmin();
  return { admin, permissions: getAdminPermissions(admin.role) };
}
