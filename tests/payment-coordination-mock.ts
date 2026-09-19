/* eslint-disable @typescript-eslint/no-explicit-any -- partial Prisma delegates intentionally differ between unit fixtures; real DB suite checks the actual contract. */
// Unit-only persistence double. Cross-connection correctness is tested in the DB suite.
import { vi } from "vitest";
export function installCoordinationMock(db: any, programme: "legacy" | "facilities", readApplication: () => Promise<any>) {
  let obligation: any;
  const results: any[] = [];
  const appKey = programme === "legacy" ? "legacyApplicationId" : "facilitiesApplicationId";
  const paymentKey = programme === "legacy" ? "legacyPaymentId" : "facilitiesPaymentId";
  db.legacyFileBinding = { findMany: vi.fn(async () => []) };
  db.$queryRaw = vi.fn(async () => []);
  db.paymentObligation = {
    findUnique: vi.fn(async () => {
      if (obligation) return obligation;
      const app = await readApplication();
      const history = app?.payments ?? [];
      if (!history.length) return null;
      const verified = history.find((p: any) => p.status === "VERIFIED");
      const selected = verified ?? (history.length === 1 ? history[0] : null);
      obligation = { id: "obligation", [appKey]: app.id ?? "app_1", [paymentKey]: selected?.id, amountToman: selected?.amountToman ?? 3000000, generation: 0, operation: null, reason: "HISTORICAL_ATTEMPT", state: verified ? "SETTLED" : "UNCERTAIN" };
      return obligation;
    }),
    findUniqueOrThrow: vi.fn(async () => obligation),
    create: vi.fn(async ({ data }) => obligation = { id: "obligation", generation: 0, ...data }),
    update: vi.fn(async ({ data }) => { obligation = { ...obligation, ...data, generation: data.generation?.increment ? (obligation.generation ?? 0) + 1 : obligation?.generation }; return obligation; }),
    updateMany: vi.fn(async ({ data }) => { obligation = { ...obligation, ...data }; return { count: 1 }; }),
  };
  db.paymentOperationResult = {
    findFirst: vi.fn(async ({ where }) => [...results].reverse().find(r => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null),
    createMany: vi.fn(async ({ data }) => { results.push(...data); return { count: data.length }; }),
  };
  db.paymentNotificationIntent = { upsert: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) };
  const delegate = programme === "legacy" ? db.payment : db.facilitiesPaymentAttempt;
  delegate.findMany = vi.fn(async (args) => ((await readApplication())?.payments ?? []).filter((p: any) => !args?.where?.status || p.status === args.where.status));
  if (programme === "legacy") {
    db.application.findUniqueOrThrow = vi.fn(async () => {
      const app = await readApplication();
      const writes = db.application.update.mock.calls.filter((call: any[]) => call[0]?.where?.id === app.id && call[0]?.data?.status);
      return { ...app, ...(writes.at(-1)?.[0]?.data ?? {}) };
    });
    delegate.findFirst = vi.fn(async () => obligation?.state === "SETTLED" ? { id: obligation[paymentKey], status: "VERIFIED" } : (await readApplication())?.payments?.find((p: any) => p.status === "VERIFIED") ?? null);
    db.application.updateMany = vi.fn(async () => ({ count: 1 }));
    if (!delegate.findUnique) delegate.findUnique = vi.fn(async ({ where }) => { const app = await readApplication(); const p = app?.payments?.find((p: any) => p.id === where.id); return p ? { applicationId: app.id, ...p } : null; });
  }
}
