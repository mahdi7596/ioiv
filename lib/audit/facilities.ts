import { randomUUID } from "node:crypto";
import {
  AuditActorType,
  AuditOutcome,
  FacilitiesAuditAction,
  Prisma,
  type PrismaClient,
} from "@prisma/client";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type FacilitiesAuditMetadata = {
  reasonCode?: string;
  fieldKeys?: string[];
  documentKind?: string;
  fileId?: string;
  uploadId?: string;
  revisionId?: string;
  intakeId?: string;
  supplierId?: string;
  templateVersionId?: string;
  paymentAttemptId?: string;
  correctionRequestId?: string;
  previousStatus?: string;
  newStatus?: string;
  status?: string;
  changedFields?: string[];
  filterKeys?: string[];
  recordCount?: number;
  sheetRowCount?: number;
  retentionHours?: number;
};

type AuditClient = Pick<PrismaClient, "facilitiesAuditLog"> | Pick<Prisma.TransactionClient, "facilitiesAuditLog">;

export function facilitiesRequestId(value?: string | null) {
  return value && UUID_PATTERN.test(value) ? value.toLowerCase() : randomUUID();
}

export function safeFilterKeys(input: Record<string, unknown>) {
  return Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key]) => key)
    .filter((key) => /^[A-Za-z][A-Za-z0-9]{0,49}$/.test(key))
    .slice(0, 20);
}

export async function writeFacilitiesAudit(
  client: AuditClient,
  input: {
    actorType: AuditActorType;
    actorId?: string | null;
    action: FacilitiesAuditAction;
    outcome?: AuditOutcome;
    entityType: string;
    entityId?: string | null;
    applicationId?: string | null;
    metadata?: FacilitiesAuditMetadata;
    requestId?: string | null;
  },
) {
  return client.facilitiesAuditLog.create({
    data: {
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      outcome: input.outcome ?? AuditOutcome.SUCCEEDED,
      entityType: input.entityType.slice(0, 100),
      entityId: input.entityId?.slice(0, 100) ?? null,
      applicationId: input.applicationId ?? null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      requestId: input.requestId ? facilitiesRequestId(input.requestId) : null,
    },
  });
}
