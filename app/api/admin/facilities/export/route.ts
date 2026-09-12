import { AuditActorType, AuditOutcome, FacilitiesAuditAction } from "@prisma/client";

import { writeFacilitiesAudit, facilitiesRequestId, safeFilterKeys } from "@/lib/audit/facilities";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { FacilitiesExportError, createFacilitiesXlsx, loadFacilitiesExportApplications, type FacilitiesExportFilters } from "@/lib/export/facilities";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { logger } from "@/lib/logger";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  const requestId = facilitiesRequestId(request.headers.get("x-request-id"));
  const startedAt = Date.now();
  const session = await getSession();
  if (!session || session.kind !== "admin") return Response.json({ error: "ورود مدیر لازم است" }, { status: 401, headers: privateHeaders });
  const admin = await db.admin.findUnique({ where: { id: session.subjectId }, select: { id: true, active: true, role: true } });
  if (!admin?.active || !hasAdminPermission(admin.role, "exportFacilitiesApplications")) return Response.json({ error: "دسترسی خروجی ندارید" }, { status: 403, headers: privateHeaders });
  const url = new URL(request.url);
  const filters: FacilitiesExportFilters = {
    intakeId: url.searchParams.get("intakeId") || undefined, supplierId: url.searchParams.get("supplierId") || undefined,
    status: url.searchParams.get("status") || undefined, from: url.searchParams.get("from") || undefined, to: url.searchParams.get("to") || undefined,
  };
  try {
    const { applications, relatedRows } = await loadFacilitiesExportApplications(filters);
    const workbook = createFacilitiesXlsx(applications);
    await writeFacilitiesAudit(db, { actorType: AuditActorType.ADMIN, actorId: admin.id, action: FacilitiesAuditAction.EXPORT_SUCCEEDED, entityType: "FacilitiesExport", entityId: requestId, metadata: { filterKeys: safeFilterKeys(filters), recordCount: applications.length, sheetRowCount: relatedRows }, requestId });
    logger.info("facilities_export_succeeded", { requestId, recordCount: applications.length, sheetRowCount: relatedRows, durationMs: Date.now() - startedAt });
    return new Response(new Uint8Array(workbook), { headers: { ...privateHeaders, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="facilities-${new Date().toISOString().slice(0, 10)}.xlsx"`, "X-Request-Id": requestId } });
  } catch (error) {
    const status = error instanceof FacilitiesExportError ? error.status : 500;
    const reasonCode = error instanceof FacilitiesExportError ? (status === 422 ? "EXPORT_LIMIT" : "INVALID_FILTER") : "EXPORT_FAILED";
    try { await writeFacilitiesAudit(db, { actorType: AuditActorType.ADMIN, actorId: admin.id, action: FacilitiesAuditAction.EXPORT_FAILED, outcome: status === 400 || status === 422 ? AuditOutcome.REJECTED : AuditOutcome.FAILED, entityType: "FacilitiesExport", entityId: requestId, metadata: { reasonCode, filterKeys: safeFilterKeys(filters) }, requestId }); } catch { /* primary failure remains authoritative */ }
    logger.error("facilities_export_failed", error, { requestId, reasonCode, durationMs: Date.now() - startedAt });
    return Response.json({ error: error instanceof FacilitiesExportError ? error.message : "ساخت خروجی ناموفق بود؛ دوباره تلاش کنید" }, { status, headers: { ...privateHeaders, "X-Request-Id": requestId } });
  }
}
