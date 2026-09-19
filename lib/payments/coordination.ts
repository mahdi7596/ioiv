import { randomUUID } from "node:crypto";
import { PaymentObligation, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export { PAYMENT_UNCERTAIN_MESSAGE } from "./messages";
export type Programme = "legacy" | "facilities";
export type PaymentClaim = { obligationId: string; generation: number; owner: string; operation: "REQUEST" | "VERIFY" };

export async function lockPaymentApplication(tx: Prisma.TransactionClient, programme: Programme, applicationId: string) {
  // One global ordering for all cooperating writers; no remote I/O in this transaction.
  if (programme === "legacy") await tx.$queryRaw`SELECT "id" FROM "Application" WHERE "id" = ${applicationId} FOR UPDATE`;
  else await tx.$queryRaw`SELECT "id" FROM "FacilitiesApplication" WHERE "id" = ${applicationId} FOR UPDATE`;
}

export async function paymentObligation(tx: Prisma.TransactionClient, programme: Programme, applicationId: string, amountToman: number) {
  const where = programme === "legacy" ? { legacyApplicationId: applicationId } : { facilitiesApplicationId: applicationId };
  const existing = await tx.paymentObligation.findUnique({ where });
  if (existing) return recoverPaymentAuthority(tx, existing);
  // Also guard against history imported after migration. Never infer finality from FAILED.
  const history = programme === "legacy"
    ? await tx.payment.findMany({ where: { applicationId }, orderBy: { createdAt: "asc" } })
    : await tx.facilitiesPaymentAttempt.findMany({ where: { applicationId }, orderBy: { createdAt: "asc" } });
  const settled = history.filter((p) => p.status === "VERIFIED");
  const selected = settled.length === 1 ? settled[0] : history.length === 1 ? history[0] : null;
  return tx.paymentObligation.create({ data: {
    ...where, amountToman: selected?.amountToman ?? amountToman,
    ...(selected ? programme === "legacy" ? { legacyPaymentId: selected.id } : { facilitiesPaymentId: selected.id } : {}),
    state: settled.length ? "SETTLED" : history.length ? "UNCERTAIN" : "READY",
    reason: history.length > 1 ? "HISTORICAL_MULTIPLE_ATTEMPTS" : history.length ? "HISTORICAL_ATTEMPT" : null,
  } });
}

export async function claimPaymentOperation(tx: Prisma.TransactionClient, obligation: PaymentObligation, operation: "REQUEST" | "VERIFY", paymentId: string): Promise<PaymentClaim> {
  const owner = randomUUID();
  const next = await tx.paymentObligation.update({ where: { id: obligation.id }, data: {
    state: operation === "REQUEST" ? "REQUESTING" : "VERIFYING", operation, owner,
    generation: { increment: 1 }, leaseUntil: new Date(Date.now() + 60_000), reason: null,
    ...(obligation.legacyApplicationId ? { legacyPaymentId: paymentId } : { facilitiesPaymentId: paymentId }),
  } });
  return { obligationId: next.id, generation: next.generation, owner, operation };
}

export async function savePaymentResult(claim: PaymentClaim, outcome: "AUTHORITY" | "CAPTURED" | "REJECTED" | "UNKNOWN", details: { authority?: string; referenceId?: string } = {}) {
  // Independent commit: a later business transaction may fail. A late owner is
  // allowed to preserve its result, never to authorize another external operation.
  await db.paymentOperationResult.createMany({ data: [{ ...claim, outcome, ...details }], skipDuplicates: true });
}

export async function markPaymentUncertain(claim: PaymentClaim, reason: string) {
  await db.paymentObligation.updateMany({ where: { id: claim.obligationId, generation: claim.generation, owner: claim.owner, state: { not: "SETTLED" } }, data: { state: "UNCERTAIN", reason } });
}

export async function beginPaymentVerification(programme: Programme, applicationId: string, paymentId: string, amountToman: number, authority: string) {
  return db.$transaction(async (tx) => {
    await lockPaymentApplication(tx, programme, applicationId);
    const obligation = await paymentObligation(tx, programme, applicationId, amountToman);
    const selected = obligation.legacyPaymentId ?? obligation.facilitiesPaymentId;
    if (selected !== paymentId) {
      // Each competing authority is retained once (callback data is not capture evidence).
      await tx.paymentOperationResult.createMany({ data: [{ obligationId: obligation.id, generation: obligation.generation, owner: paymentId, operation: "CALLBACK", outcome: "COMPETING_CALLBACK", authority }], skipDuplicates: true });
      if (obligation.state === "SETTLED") return { kind: "settled" as const, obligation };
      return { kind: "pending" as const, obligation };
    }
    if (obligation.state === "SETTLED") return { kind: "settled" as const, obligation };
    const capture = await tx.paymentOperationResult.findFirst({ where: { obligationId: obligation.id, outcome: "CAPTURED", authority }, orderBy: { createdAt: "asc" } });
    if (capture?.referenceId) return { kind: "captured" as const, obligation, referenceId: capture.referenceId };
    const prior = await tx.paymentOperationResult.findFirst({ where: { obligationId: obligation.id, generation: obligation.generation, owner: obligation.owner ?? "", operation: "VERIFY", authority }, orderBy: { createdAt: "desc" } });
    // A response that completed permits a sequential SAME-authority check. An
    // uncertain transport or expired worker does not: its remote call may be alive.
    const canCheck = obligation.state === "PAYABLE" ||
      (obligation.operation === null && obligation.reason === "HISTORICAL_ATTEMPT") ||
      (obligation.operation === "VERIFY" && prior?.outcome === "REJECTED");
    if (!canCheck) return { kind: "pending" as const, obligation };
    const claim = await claimPaymentOperation(tx, obligation, "VERIFY", paymentId);
    return { kind: "claimed" as const, obligation, claim };
  });
}

export async function finishPaymentRequest(claim: PaymentClaim, programme: Programme, applicationId: string, paymentId: string, authority: string, persist: (tx: Prisma.TransactionClient) => Promise<void>) {
  await savePaymentResult(claim, "AUTHORITY", { authority });
  return db.$transaction(async (tx) => {
    await lockPaymentApplication(tx, programme, applicationId);
    const obligation = await tx.paymentObligation.findUniqueOrThrow({ where: { id: claim.obligationId } });
    if (obligation.owner !== claim.owner || obligation.generation !== claim.generation || obligation.state === "SETTLED" || (obligation.legacyPaymentId ?? obligation.facilitiesPaymentId) !== paymentId) return false;
    await persist(tx);
    await tx.paymentObligation.update({ where: { id: obligation.id }, data: { state: "PAYABLE", reason: null } });
    return true;
  });
}

async function recoverPaymentAuthority(tx: Prisma.TransactionClient, obligation: PaymentObligation) {
  if (obligation.operation !== "REQUEST" || obligation.state === "SETTLED") return obligation;
  const result = await tx.paymentOperationResult.findFirst({ where: { obligationId: obligation.id, generation: obligation.generation, owner: obligation.owner ?? "", outcome: "AUTHORITY" } });
  if (!result?.authority) return obligation;
  if (obligation.legacyPaymentId) {
    await tx.payment.update({ where: { id: obligation.legacyPaymentId }, data: { authority: result.authority } });
    await tx.application.updateMany({ where: { id: obligation.legacyApplicationId!, status: "DRAFT" }, data: { status: "PENDING_PAYMENT" } });
  } else if (obligation.facilitiesPaymentId) {
    const payment = await tx.facilitiesPaymentAttempt.findUniqueOrThrow({ where: { id: obligation.facilitiesPaymentId } });
    if (payment.status !== "INITIATED" && payment.authority !== result.authority) return obligation;
    if (payment.status === "INITIATED") await tx.facilitiesPaymentAttempt.update({ where: { id: payment.id }, data: { authority: result.authority, status: "REDIRECT_READY" } });
  }
  return tx.paymentObligation.update({ where: { id: obligation.id }, data: { state: "PAYABLE", reason: null } });
}

export function existingPaymentUrl(authority: string) {
  return `${process.env.ZARINPAL_SANDBOX === "true" ? "https://sandbox.zarinpal.com" : "https://payment.zarinpal.com"}/pg/StartPay/${encodeURIComponent(authority)}`;
}
