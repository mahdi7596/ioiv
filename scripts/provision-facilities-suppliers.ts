import { db } from "@/lib/db";

export const APPROVED_FACILITY_SUPPLIERS = [
  "شرکت ملی نفت ایران",
  "شرکت ملی گاز ایران",
  "شرکت ملی صنایع پتروشیمی ایران",
  "شرکت ملی پالایش و پخش فرآورده‌های نفتی ایران",
] as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const unknown = process.argv.slice(2).filter((argument) => argument !== "--apply");
  if (unknown.length) throw new Error("Only --apply is supported");
  const existing = await db.facilitySupplier.findMany({ select: { name: true } });
  const names = new Set(existing.map((row) => row.name));
  const missing = APPROVED_FACILITY_SUPPLIERS.filter((name) => !names.has(name));
  const unexpectedCount = existing.filter((row) => !(APPROVED_FACILITY_SUPPLIERS as readonly string[]).includes(row.name)).length;
  if (unexpectedCount) {
    console.error(JSON.stringify({ event: "facilities_supplier_provisioning_blocked", reasonCode: "UNEXPECTED_EXISTING_SUPPLIER", unexpectedCount }));
    process.exitCode = 1;
    return;
  }
  let insertedCount = 0;
  if (apply && missing.length) {
    insertedCount = await db.$transaction(async (tx) => {
      const result = await tx.facilitySupplier.createMany({ data: missing.map((name) => ({ name })), skipDuplicates: true });
      return result.count;
    });
  }
  console.info(JSON.stringify({ event: "facilities_supplier_provisioning", mode: apply ? "apply" : "dry-run", approvedCount: APPROVED_FACILITY_SUPPLIERS.length, existingApprovedCount: APPROVED_FACILITY_SUPPLIERS.length - missing.length, missingCount: missing.length, insertedCount }));
}

main().catch(() => {
  console.error(JSON.stringify({ event: "facilities_supplier_provisioning_failed", reasonCode: "UNEXPECTED" }));
  process.exitCode = 1;
}).finally(async () => db.$disconnect());
