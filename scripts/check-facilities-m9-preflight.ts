import { readdir } from "node:fs/promises";

import { db } from "@/lib/db";
import { evaluateM9Preflight, type ProgrammeExpectation } from "@/lib/facilities-m9/release";

type RoleRow = { rolsuper: boolean; rolcreaterole: boolean; rolcreatedb: boolean; rolinherit: boolean };
type ProtectedRow = { owns_protected: boolean; inherits_owner: boolean };
type PrivilegeRow = {
  audit_select: boolean; audit_insert: boolean; audit_update: boolean; audit_delete: boolean; audit_truncate: boolean;
  history_select: boolean; history_insert: boolean; history_update: boolean; history_delete: boolean; history_truncate: boolean;
};
type MigrationRow = { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null };

function expectation(): ProgrammeExpectation {
  const index = process.argv.indexOf("--expect-programme");
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (value !== "disabled" && value !== "enabled") throw new Error("--expect-programme must be explicitly set to disabled or enabled");
  return value;
}

function runtimeRole() {
  const index = process.argv.indexOf("--runtime-role");
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || !/^[A-Za-z0-9_]+$/.test(value)) throw new Error("--runtime-role must be explicitly set to a safe database role name");
  return value;
}

async function main() {
  const expectedProgramme = expectation();
  const inspectedRuntimeRole = runtimeRole();
  const expectedMigrations = (await readdir("prisma/migrations", { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const [programme, enabledIntakes, enabledIntakeSuppliers, activePaymentAttempts, roles, protectedRows, privileges, migrations] = await Promise.all([
    db.facilitiesProgramConfiguration.findUnique({ where: { program: "FACILITIES" }, select: { isEnabled: true } }),
    db.facilityIntake.count({ where: { isEnabled: true } }),
    db.facilityIntakeSupplier.count({ where: { isEnabled: true, intake: { isEnabled: true } } }),
    db.facilitiesPaymentAttempt.count({ where: { status: { in: ["INITIATED", "REDIRECT_READY", "PENDING"] } } }),
    db.$queryRaw<RoleRow[]>`SELECT rolsuper, rolcreaterole, rolcreatedb, rolinherit FROM pg_roles WHERE rolname = ${inspectedRuntimeRole}`,
    db.$queryRaw<ProtectedRow[]>`
      SELECT bool_or(owner.rolname = ${inspectedRuntimeRole}) AS owns_protected,
             bool_or(owner.rolname <> ${inspectedRuntimeRole} AND pg_has_role(${inspectedRuntimeRole}, owner.oid, 'MEMBER')) AS inherits_owner
      FROM pg_class relation
      JOIN pg_roles owner ON owner.oid = relation.relowner
      WHERE relation.relname IN ('FacilitiesAuditLog', 'FacilitiesStatusHistory')`,
    db.$queryRaw<PrivilegeRow[]>`
      SELECT has_table_privilege(${inspectedRuntimeRole}, '"FacilitiesAuditLog"', 'SELECT') AS audit_select,
             has_table_privilege(${inspectedRuntimeRole}, '"FacilitiesAuditLog"', 'INSERT') AS audit_insert,
             has_table_privilege(${inspectedRuntimeRole}, '"FacilitiesAuditLog"', 'UPDATE') AS audit_update,
             has_table_privilege(${inspectedRuntimeRole}, '"FacilitiesAuditLog"', 'DELETE') AS audit_delete,
             has_table_privilege(${inspectedRuntimeRole}, '"FacilitiesAuditLog"', 'TRUNCATE') AS audit_truncate,
             has_table_privilege(${inspectedRuntimeRole}, '"FacilitiesStatusHistory"', 'SELECT') AS history_select,
             has_table_privilege(${inspectedRuntimeRole}, '"FacilitiesStatusHistory"', 'INSERT') AS history_insert,
             has_table_privilege(${inspectedRuntimeRole}, '"FacilitiesStatusHistory"', 'UPDATE') AS history_update,
             has_table_privilege(${inspectedRuntimeRole}, '"FacilitiesStatusHistory"', 'DELETE') AS history_delete,
             has_table_privilege(${inspectedRuntimeRole}, '"FacilitiesStatusHistory"', 'TRUNCATE') AS history_truncate`,
    db.$queryRaw<MigrationRow[]>`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`,
  ]);
  const role = roles[0];
  const protectedRole = protectedRows[0];
  const privilege = privileges[0];
  if (!role || !protectedRole || !privilege) throw new Error("database role inspection returned no row");
  const applied = new Set(migrations.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name));
  const snapshot = {
    expectedProgramme,
    programmeEnabled: Boolean(programme?.isEnabled),
    enabledIntakes,
    enabledIntakeSuppliers,
    activePaymentAttempts,
    unresolvedMigrations: migrations.filter((row) => !row.finished_at && !row.rolled_back_at).length,
    missingMigrations: expectedMigrations.filter((name) => !applied.has(name)).length,
    role: { superuser: role.rolsuper, createRole: role.rolcreaterole, createDb: role.rolcreatedb, inherit: role.rolinherit, ownsProtectedTables: protectedRole.owns_protected, inheritsProtectedOwner: protectedRole.inherits_owner },
    immutablePrivileges: { auditSelect: privilege.audit_select, auditInsert: privilege.audit_insert, auditUpdate: privilege.audit_update, auditDelete: privilege.audit_delete, auditTruncate: privilege.audit_truncate, historySelect: privilege.history_select, historyInsert: privilege.history_insert, historyUpdate: privilege.history_update, historyDelete: privilege.history_delete, historyTruncate: privilege.history_truncate },
  };
  const evaluation = evaluateM9Preflight(snapshot);
  console.info(JSON.stringify({ event: "facilities_m9_preflight", ...evaluation, expectedProgramme, programmeEnabled: snapshot.programmeEnabled, enabledIntakes, enabledIntakeSuppliers, activePaymentAttempts, unresolvedMigrations: snapshot.unresolvedMigrations, missingMigrations: snapshot.missingMigrations }));
  if (!evaluation.ready) process.exitCode = 1;
}

main().catch(() => {
  console.error(JSON.stringify({ event: "facilities_m9_preflight_failed", reasonCode: "UNEXPECTED_OR_INCOMPLETE_DATABASE" }));
  process.exitCode = 1;
}).finally(async () => db.$disconnect());
