import { AuditActorType, AuditOutcome, FacilitiesAuditAction, Prisma } from "@prisma/client";

import { ActionError } from "@/lib/actions/auth";
import { requireFacilitiesAdmin } from "@/lib/admin/facilities-access";
import { facilitiesRequestId, safeFilterKeys, writeFacilitiesAudit } from "@/lib/audit/facilities";
import { db } from "@/lib/db";
import { parseTehranDateBoundary } from "@/lib/export/facilities";

const IDENTIFIER = /^[A-Za-z0-9_-]{1,100}$/;
const PAGE_SIZE = 50;
const SAFE_METADATA_KEYS = new Set(["reasonCode", "fieldKeys", "documentKind", "fileId", "uploadId", "revisionId", "intakeId", "supplierId", "templateVersionId", "paymentAttemptId", "correctionRequestId", "previousStatus", "newStatus", "status", "changedFields", "filterKeys", "recordCount", "sheetRowCount", "retentionHours"]);

export type FacilitiesAuditFilters = { from?: string; to?: string; action?: string; outcome?: string; actorType?: string; applicationId?: string; entityId?: string; requestId?: string; cursor?: string };
type Cursor = { createdAt: string; id: string };

export function encodeFacilitiesAuditCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeFacilitiesAuditCursor(value?: string) {
  if (!value || value.length > 300) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
    const createdAt = new Date(parsed.createdAt);
    if (!IDENTIFIER.test(parsed.id) || Number.isNaN(createdAt.getTime())) throw new Error();
    return { createdAt, id: parsed.id };
  } catch { throw new ActionError("نشانگر صفحه معتبر نیست", 400); }
}

export function maskAuditIp(value: string | null) {
  if (!value) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return value.replace(/\.\d+$/, ".xxx");
  const parts = value.split(":");
  return parts.length > 2 ? `${parts.slice(0, 3).join(":")}:…` : "پنهان";
}

export function safeAuditMetadata(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter(([key]) => SAFE_METADATA_KEYS.has(key)));
}

function validated(filters: FacilitiesAuditFilters) {
  if (filters.action && !Object.values(FacilitiesAuditAction).includes(filters.action as FacilitiesAuditAction)) throw new ActionError("نوع رویداد معتبر نیست", 400);
  if (filters.outcome && !Object.values(AuditOutcome).includes(filters.outcome as AuditOutcome)) throw new ActionError("نتیجه رویداد معتبر نیست", 400);
  if (filters.actorType && !Object.values(AuditActorType).includes(filters.actorType as AuditActorType)) throw new ActionError("نوع عامل معتبر نیست", 400);
  for (const value of [filters.applicationId, filters.entityId]) if (value && !IDENTIFIER.test(value)) throw new ActionError("شناسه فیلتر معتبر نیست", 400);
  if (filters.requestId && !/^[0-9a-f-]{36}$/i.test(filters.requestId)) throw new ActionError("شناسه درخواست معتبر نیست", 400);
  const from = filters.from ? parseTehranDateBoundary(filters.from) : undefined;
  const toExclusive = filters.to ? parseTehranDateBoundary(filters.to, true) : undefined;
  if (from && toExclusive && from >= toExclusive) throw new ActionError("بازه تاریخ معتبر نیست", 400);
  return { from, toExclusive, cursor: decodeFacilitiesAuditCursor(filters.cursor) };
}

export async function listFacilitiesAudit(filters: FacilitiesAuditFilters) {
  const admin = await requireFacilitiesAdmin("viewFacilitiesAudit");
  const { from, toExclusive, cursor } = validated(filters);
  const requestId = facilitiesRequestId();
  const where: Prisma.FacilitiesAuditLogWhereInput = {
    ...(filters.action ? { action: filters.action as FacilitiesAuditAction } : {}),
    ...(filters.outcome ? { outcome: filters.outcome as AuditOutcome } : {}),
    ...(filters.actorType ? { actorType: filters.actorType as AuditActorType } : {}),
    ...(filters.applicationId ? { applicationId: filters.applicationId } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(filters.requestId ? { requestId: filters.requestId.toLowerCase() } : {}),
    ...((from || toExclusive || cursor) ? { AND: [
      ...((from || toExclusive) ? [{ createdAt: { ...(from ? { gte: from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) } }] : []),
      ...(cursor ? [{ OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }] : []),
    ] } : {}),
  };
  const found = await db.facilitiesAuditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: PAGE_SIZE + 1 });
  const rows = found.slice(0, PAGE_SIZE).map((row) => ({ ...row, metadata: safeAuditMetadata(row.metadata), ipAddress: maskAuditIp(row.ipAddress), userAgent: row.userAgent ? `${row.userAgent.slice(0, 80)}${row.userAgent.length > 80 ? "…" : ""}` : null }));
  const last = rows.at(-1);
  const nextCursor = found.length > PAGE_SIZE && last ? encodeFacilitiesAuditCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;
  await writeFacilitiesAudit(db, { actorType: AuditActorType.ADMIN, actorId: admin.id, action: FacilitiesAuditAction.AUDIT_VIEWED, entityType: "FacilitiesAuditLog", entityId: requestId, metadata: { filterKeys: safeFilterKeys(filters), recordCount: rows.length }, requestId });
  return { rows, nextCursor, requestId };
}

export const facilitiesAuditFilterOptions = { actions: Object.values(FacilitiesAuditAction), outcomes: Object.values(AuditOutcome), actorTypes: Object.values(AuditActorType) };
