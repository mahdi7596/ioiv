import { AuditActorType, AuditOutcome, Prisma, PrismaClient } from "@prisma/client";

/**
 * The only audit actions application code may write. Add actions deliberately so
 * reporting does not depend on inconsistent free-form strings.
 */
export const auditActions = [
  "auth.login_succeeded",
  "auth.login_rejected",
  "company_profile.created",
  "company_profile.updated",
  "application.created",
  "application.draft_saved",
  "application.submitted",
  "application.correction_submitted",
  "application.status_changed",
  "file.uploaded",
  "file.replaced",
  "file.deleted",
  "payment.started",
  "payment.verified",
  "payment.failed",
  "payment.callback_rejected",
  "supplier_configuration.updated",
  "questionnaire_template.updated",
  "admin.exported",
] as const;

export type AuditAction = (typeof auditActions)[number];

type AuditActor =
  | { type: "USER"; id: string }
  | { type: "ADMIN"; id: string }
  | { type: "SYSTEM"; id?: never };

type AuditMetadata = {
  changedFields?: string[];
  fileFieldKey?: string;
  fileSizeBytes?: number;
  paymentStatus?: string;
  provider?: string;
  reasonCode?: string;
  templateVersion?: string;
  exportFormat?: "csv" | "xlsx";
  filterKeys?: string[];
};

type AuditClient = Pick<PrismaClient, "auditLog"> | Pick<Prisma.TransactionClient, "auditLog">;

export type WriteAuditLogInput = {
  actor: AuditActor;
  action: AuditAction;
  entity: { type: string; id: string };
  applicationId?: string;
  outcome?: AuditOutcome;
  metadata?: AuditMetadata;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
};

/**
 * Writes a privacy-safe, append-only audit event. Call this from the same Prisma
 * transaction as the action being recorded. Metadata deliberately contains only
 * operational facts—never user-entered values, OTPs, credentials, payment secrets,
 * raw gateway payloads, document contents, storage paths, or download URLs.
 */
export async function writeAuditLog(client: AuditClient, input: WriteAuditLogInput) {
  return client.auditLog.create({
    data: {
      actorType: input.actor.type,
      actorId: input.actor.type === AuditActorType.SYSTEM ? null : input.actor.id,
      action: input.action,
      outcome: input.outcome ?? AuditOutcome.SUCCEEDED,
      entityType: input.entity.type,
      entityId: input.entity.id,
      applicationId: input.applicationId,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      requestId: input.requestId,
      ipAddress: input.ipAddress?.slice(0, 64),
      userAgent: input.userAgent?.slice(0, 512),
    },
  });
}
