import type { Application, Prisma } from "@prisma/client";
import { ActionError } from "@/lib/actions/auth";
import { requireSession } from "@/lib/auth/session";
import { hasAdminPermission, type AdminPermission } from "./permissions";
import { LEGACY_FILE_CONFLICT } from "@/lib/uploads/coordination";

export function assertReviewSnapshot(form: FormData, application: Pick<Application, "status" | "draftVersion">) {
  const raw = form.get("expectedVersion");
  const version = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(version) || version !== application.draftVersion || form.get("expectedStatus") !== application.status) {
    throw new ActionError(LEGACY_FILE_CONFLICT, 409);
  }
}

/** Application lock first, then admin row: revocation and this decision serialize. */
export async function requireLockedReviewAdmin(tx: Prisma.TransactionClient, adminId: string, permission: AdminPermission) {
  let subjectId: string;
  try { subjectId = (await requireSession("admin")).subjectId; }
  catch { throw new ActionError("نشست شما پایان یافته است. دوباره وارد شوید.", 401); }
  if (subjectId !== adminId) throw new ActionError("نشست مدیریت تغییر کرده است. دوباره وارد شوید.", 401);
  await tx.$queryRaw`SELECT public.lock_review_admin(${adminId})::text`;
  const admin = await tx.admin.findUnique({ where: { id: adminId } });
  if (!admin?.active || !hasAdminPermission(admin.role, permission)) throw new ActionError("برای این عملیات دسترسی لازم را ندارید", 403);
}
