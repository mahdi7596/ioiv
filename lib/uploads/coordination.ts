import type { Application, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canEditApplication } from "@/lib/application/status";
import { VALIDATION_CERTIFICATE_FIELD_KEY } from "@/lib/application/certificate";
import { legacyReferences, LEGACY_CANONICAL_SLOT, setLegacyFile } from "./slots";
import type { StoredUpload } from "./storage";

export const LEGACY_FILE_CONFLICT = "اطلاعات یا فایل پرونده تغییر کرده است. صفحه را تازه‌سازی و دوباره تلاش کنید.";
export class LegacyFileConflict extends Error {
  constructor() { super(LEGACY_FILE_CONFLICT); }
}
export const legacyTransactionOptions = { maxWait: 3000, timeout: 5000 };
export async function lockLegacyApplication(tx: Prisma.TransactionClient, applicationId: string) {
  await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${applicationId} FOR UPDATE`;
  return tx.application.findUniqueOrThrow({ where: { id: applicationId } });
}
export function legacyDraftData(draft: object) {
  const d = draft as Application;
  return {
    currentStep: d.currentStep,
    taxDeclarations: d.taxDeclarations as Prisma.InputJsonValue,
    financials: d.financials as Prisma.InputJsonValue,
    humanResources: d.humanResources as Prisma.InputJsonValue,
    trialBalance: d.trialBalance as Prisma.InputJsonValue,
    creditReports: d.creditReports as Prisma.InputJsonValue,
  };
}

export async function assertLegacyEditable(tx: Prisma.TransactionClient, application: Application, userId: string) {
  if (application.userId !== userId || !canEditApplication(application.status)) throw new LegacyFileConflict();
  const obligation = await tx.paymentObligation.findUnique({ where: { legacyApplicationId: application.id } });
  if (obligation && !["READY", "SETTLED"].includes(obligation.state)) throw new LegacyFileConflict();
}

/** Call only under the existing application lock, including payment reservations. */
export async function validateLegacyDraft(tx: Prisma.TransactionClient, current: Application, draft: object, expectedVersion: number | undefined) {
  if (expectedVersion !== current.draftVersion) throw new LegacyFileConflict();
  const refs = legacyReferences(draft);
  const priorRefs = legacyReferences(current);
  const bindings = await tx.legacyFileBinding.findMany({ where: { applicationId: current.id } });
  for (const binding of bindings) {
    if (binding.slotKey === VALIDATION_CERTIFICATE_FIELD_KEY) continue;
    const ref = refs.get(binding.slotKey);
    if (ref?.fileId !== binding.currentFileId || (ref.generation !== undefined && ref.generation !== binding.generation)) throw new LegacyFileConflict();
  }
  for (const [slot, ref] of refs) {
    // Preserve unresolved historical values without declaring them verified (D4).
    if (priorRefs.get(slot)?.fileId === ref.fileId) continue;
    if (!LEGACY_CANONICAL_SLOT.test(slot)) throw new LegacyFileConflict();
    const binding = bindings.find(b => b.slotKey === slot);
    if (!binding || binding.currentFileId !== ref.fileId || (ref.generation !== undefined && binding.generation !== ref.generation)) throw new LegacyFileConflict();
  }
}

/** Staging is outside this transaction; callers must preserve bytes on uncertain commit. */
export async function commitLegacyFile(tx: Prisma.TransactionClient, input: {
  application: Application;
  fieldKey: string;
  stored: StoredUpload;
  expectedGeneration?: number;
}) {
  const { application, fieldKey, stored } = input;
  if (fieldKey !== VALIDATION_CERTIFICATE_FIELD_KEY && !LEGACY_CANONICAL_SLOT.test(fieldKey)) throw new LegacyFileConflict();
  const binding = await tx.legacyFileBinding.findUnique({ where: { applicationId_slotKey: { applicationId: application.id, slotKey: fieldKey } } });
  if (input.expectedGeneration !== undefined && input.expectedGeneration !== (binding?.generation ?? 0)) throw new LegacyFileConflict();
  const { candidateId, ...metadata } = stored;
  if (candidateId) {
    await tx.$queryRaw`SELECT id FROM "LegacyUploadCandidate" WHERE id=${candidateId} FOR UPDATE`;
    const candidate = await tx.legacyUploadCandidate.findUniqueOrThrow({ where: { id: candidateId } });
    if (candidate.status !== "READY" || candidate.applicationId !== application.id || candidate.slotKey !== fieldKey || candidate.storagePath !== stored.storagePath) throw new LegacyFileConflict();
  }
  const file = await tx.applicationFile.create({ data: { applicationId: application.id, fieldKey, ...metadata } });
  if (candidateId) await tx.legacyUploadCandidate.update({ where: { id: candidateId }, data: { status: "COMMITTED", fileId: file.id } });
  const generation = (binding?.generation ?? 0) + 1;
  const data = { currentFileId: file.id, generation };
  if (binding) await tx.legacyFileBinding.update({ where: { id: binding.id }, data });
  else await tx.legacyFileBinding.create({ data: { applicationId: application.id, slotKey: fieldKey, ...data } });
  const ref = { fileId: file.id, name: file.originalName, generation };
  const next = fieldKey === VALIDATION_CERTIFICATE_FIELD_KEY ? application : setLegacyFile(application, fieldKey, ref);
  const updated = await tx.application.update({ where: { id: application.id }, data: {
    ...legacyDraftData(next), draftVersion: { increment: 1 },
  } });
  return { ...ref, fieldKey, draftVersion: updated.draftVersion };
}
export async function commitApplicantUpload(input: {
  applicationId: string; userId: string; fieldKey: string; stored: StoredUpload; expectedGeneration: number;
}) {
  return db.$transaction(async tx => {
    const application = await lockLegacyApplication(tx, input.applicationId);
    await assertLegacyEditable(tx, application, input.userId);
    return commitLegacyFile(tx, { ...input, application });
  }, legacyTransactionOptions);
}
