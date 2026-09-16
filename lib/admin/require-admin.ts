import { hasAdminPermission, type AdminPermission } from "@/lib/admin/permissions";
import { ActionError } from "@/lib/actions/auth";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

/**
 * Session plus live database role check for administrative work. Lives outside
 * the `"use server"` action module so route handlers can call it before they
 * read a request body, and so it is never registered as a callable action.
 */
export async function requireActiveAdmin(permission: AdminPermission = "viewAdminPanel") {
  const session = await requireSession("admin");
  const admin = await db.admin.findUnique({ where: { id: session.subjectId } });

  if (!admin?.active) {
    throw new ActionError("دسترسی مدیریت فعال نیست", 403);
  }

  if (!hasAdminPermission(admin.role, permission)) {
    throw new ActionError("برای این عملیات دسترسی لازم را ندارید", 403);
  }

  return admin;
}
