import { createHash } from "node:crypto";

export const M9_DECISION_IDS = [
  "production-intake",
  "supplier-questionnaires",
  "amount-payment",
  "payment-acknowledgement",
  "correction-scope",
  "profile-quota",
  "file-policy",
  "scanner-operations",
  "capacity-retention",
  "alerting-support",
  "release-safety",
  "dependency-security",
] as const;

export const M9_GATES = ["G0", "G1", "G2", "G3", "G4", "G5", "G6", "G7"] as const;
export type M9Gate = (typeof M9_GATES)[number];
export type ProgrammeExpectation = "disabled" | "enabled";

const gateDependencies: Record<M9Gate, M9Gate[]> = {
  G0: [],
  G1: ["G0"],
  G2: ["G0", "G1"],
  G3: ["G0", "G1", "G2"],
  G4: ["G0", "G1", "G2", "G3"],
  G5: ["G0", "G1", "G2", "G3", "G4"],
  G6: ["G0", "G1", "G2", "G3", "G4", "G5"],
  G7: ["G0", "G1", "G2", "G3", "G4", "G5", "G6"],
};

const prohibitedKey = /(password|secret|token|credential|api.?key|database.?url|dump.?content|document.?content|mobile|national.?id)/i;
const prohibitedValue = /(postgres(?:ql)?:\/\/[^\s]+:[^\s]+@|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;

export type M9ValidationResult = { valid: boolean; errors: string[]; pending: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isIsoDate(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function rejectUnexpectedKeys(value: Record<string, unknown>, allowed: readonly string[], path: string) {
  return Object.keys(value).filter((key) => !allowed.includes(key)).map((key) => `${path} contains unsupported field '${key}'`);
}

function scanForProhibitedData(value: unknown, path = "root"): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => scanForProhibitedData(item, `${path}[${index}]`));
  if (!isRecord(value)) {
    return typeof value === "string" && prohibitedValue.test(value) ? [`${path} contains prohibited secret material`] : [];
  }
  return Object.entries(value).flatMap(([key, nested]) =>
    prohibitedKey.test(key)
      ? [`${path} contains prohibited field '${key}'`]
      : scanForProhibitedData(nested, `${path}.${key}`),
  );
}

export function validateM9ReleaseDocuments(
  decisions: unknown,
  evidence: unknown,
  requireGate?: M9Gate,
): M9ValidationResult {
  const errors = [...scanForProhibitedData(decisions, "decisions"), ...scanForProhibitedData(evidence, "evidence")];
  const pending: string[] = [];

  if (!isRecord(decisions) || decisions.schemaVersion !== 1 || typeof decisions.releaseId !== "string" || !Array.isArray(decisions.decisions)) {
    errors.push("decision register has an invalid top-level structure");
  } else {
    errors.push(...rejectUnexpectedKeys(decisions, ["schemaVersion", "releaseId", "decisions"], "decision register"));
    if (!decisions.releaseId.trim()) errors.push("decision register has an empty release ID");
    const rows = new Map<string, Record<string, unknown>>();
    for (const item of decisions.decisions) {
      if (!isRecord(item) || typeof item.id !== "string") {
        errors.push("decision register contains an invalid decision row");
        continue;
      }
      errors.push(...rejectUnexpectedKeys(item, ["id", "status", "value", "approver", "decidedAt", "evidenceRef"], `decision '${item.id}'`));
      if (rows.has(item.id)) errors.push(`decision '${item.id}' is duplicated`);
      rows.set(item.id, item);
    }
    for (const id of M9_DECISION_IDS) {
      const item = rows.get(id);
      if (!item) {
        errors.push(`decision '${id}' is missing`);
        continue;
      }
      if (!(["pending", "approved", "rejected"] as unknown[]).includes(item.status)) errors.push(`decision '${id}' has an invalid status`);
      if (item.status !== "approved") pending.push(`decision:${id}`);
      if (item.status === "approved") {
        if (typeof item.value !== "string" || !item.value.trim()) errors.push(`approved decision '${id}' has no accepted value`);
        if (typeof item.approver !== "string" || !item.approver.trim()) errors.push(`approved decision '${id}' has no approver`);
        if (!isIsoDate(item.decidedAt)) errors.push(`approved decision '${id}' has no valid decision timestamp`);
        if (typeof item.evidenceRef !== "string" || !item.evidenceRef.startsWith("protected://")) errors.push(`approved decision '${id}' has no protected evidence reference`);
      }
    }
    for (const id of rows.keys()) if (!(M9_DECISION_IDS as readonly string[]).includes(id)) errors.push(`unknown decision '${id}'`);
  }

  const gateRows = new Map<M9Gate, Record<string, unknown>>();
  if (!isRecord(evidence) || evidence.schemaVersion !== 1 || typeof evidence.releaseId !== "string" || !Array.isArray(evidence.gates)) {
    errors.push("evidence ledger has an invalid top-level structure");
  } else {
    errors.push(...rejectUnexpectedKeys(evidence, ["schemaVersion", "releaseId", "candidateId", "configurationId", "gates"], "evidence ledger"));
    if (!evidence.releaseId.trim()) errors.push("evidence ledger has an empty release ID");
    if (isRecord(decisions) && decisions.releaseId !== evidence.releaseId) errors.push("decision and evidence release IDs do not match");
    if (typeof evidence.candidateId !== "string" || !evidence.candidateId.trim()) errors.push("evidence ledger has no candidate identity");
    if (typeof evidence.configurationId !== "string" || !evidence.configurationId.trim()) errors.push("evidence ledger has no configuration identity");
    for (const item of evidence.gates) {
      if (!isRecord(item) || !(M9_GATES as readonly unknown[]).includes(item.id)) {
        errors.push("evidence ledger contains an invalid gate row");
        continue;
      }
      const id = item.id as M9Gate;
      errors.push(...rejectUnexpectedKeys(item, ["id", "status", "owner", "approver", "completedAt", "incidentRef", "checks"], `gate '${id}'`));
      if (gateRows.has(id)) errors.push(`gate '${id}' is duplicated`);
      gateRows.set(id, item);
    }
    for (const id of M9_GATES) {
      const item = gateRows.get(id);
      if (!item) {
        errors.push(`gate '${id}' is missing`);
        continue;
      }
      if (!(["pending", "passed", "failed", "invalidated"] as unknown[]).includes(item.status)) errors.push(`gate '${id}' has an invalid status`);
      if (item.status !== "passed") pending.push(`gate:${id}`);
      if (!Array.isArray(item.checks)) errors.push(`gate '${id}' checks must be an array`);
      else for (const check of item.checks) {
        if (!isRecord(check)) errors.push(`gate '${id}' contains an invalid check`);
        else {
          errors.push(...rejectUnexpectedKeys(check, ["id", "result", "expected", "actual", "evidenceRef"], `gate '${id}' check`));
          if (typeof check.id !== "string" || !(["passed", "failed"] as unknown[]).includes(check.result) || typeof check.expected !== "string" || typeof check.actual !== "string" || typeof check.evidenceRef !== "string") errors.push(`gate '${id}' contains an invalid check`);
        }
      }
      if (item.status === "passed") {
        if (!isIsoDate(item.completedAt)) errors.push(`passed gate '${id}' has no valid completion timestamp`);
        if (typeof item.owner !== "string" || !item.owner.trim()) errors.push(`passed gate '${id}' has no owner`);
        if (typeof item.approver !== "string" || !item.approver.trim()) errors.push(`passed gate '${id}' has no approver`);
        if (!Array.isArray(item.checks) || item.checks.length === 0) errors.push(`passed gate '${id}' has no checks`);
        else for (const check of item.checks) {
          if (!isRecord(check) || typeof check.id !== "string" || check.result !== "passed" || typeof check.expected !== "string" || typeof check.actual !== "string" || typeof check.evidenceRef !== "string" || !check.evidenceRef.startsWith("protected://")) {
            errors.push(`passed gate '${id}' has an incomplete or unsuccessful check`);
          }
        }
        for (const dependency of gateDependencies[id]) if (gateRows.get(dependency)?.status !== "passed") errors.push(`gate '${id}' passed before dependency '${dependency}'`);
      }
    }
    if (gateRows.get("G0")?.status === "passed" && pending.some((item) => item.startsWith("decision:"))) errors.push("gate 'G0' cannot pass with unresolved decisions");
    if ([...gateRows.values()].some((item) => item.status === "passed") && (evidence.candidateId === "PENDING" || evidence.configurationId === "PENDING")) errors.push("passed gates require final candidate and configuration identities");
  }

  if (requireGate) {
    if (decisions && isRecord(decisions) && pending.some((item) => item.startsWith("decision:"))) errors.push(`gate '${requireGate}' requires every G0 decision to be approved`);
    if (isRecord(evidence) && gateRows.get(requireGate)?.status === "passed" && (evidence.candidateId === "PENDING" || evidence.configurationId === "PENDING")) errors.push(`passed gate '${requireGate}' requires final candidate and configuration identities`);
    for (const dependency of [...gateDependencies[requireGate], requireGate]) {
      if (gateRows.get(dependency)?.status !== "passed") errors.push(`required gate '${dependency}' has not passed`);
    }
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)], pending: [...new Set(pending)] };
}

export type CandidateFile = { path: string; bytes: Uint8Array };

export function buildCandidateManifest(input: { sourceSha: string; dirtyPaths: string[]; files: CandidateFile[]; generatedAt?: string }) {
  if (!/^[0-9a-f]{40}$/.test(input.sourceSha)) throw new Error("Candidate source SHA must be a full 40-character Git SHA");
  if (input.dirtyPaths.length) throw new Error("Candidate worktree is not clean");
  const files = [...input.files]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => ({ path: file.path, sha256: createHash("sha256").update(file.bytes).digest("hex"), byteSize: file.bytes.byteLength }));
  const aggregate = createHash("sha256").update(files.map((file) => `${file.path}\0${file.sha256}\0${file.byteSize}\n`).join("")).digest("hex");
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceSha: input.sourceSha,
    releaseInputsSha256: aggregate,
    files,
    externalArtifacts: {
      linuxPrismaExportSha256: "PENDING",
      candidateImageDigest: "PENDING",
      previousDeploymentIdentity: "PENDING",
      remoteBackupRef: "PENDING",
    },
  };
}

export type M9PreflightSnapshot = {
  expectedProgramme: ProgrammeExpectation;
  programmeEnabled: boolean;
  enabledIntakes: number;
  enabledIntakeSuppliers: number;
  activePaymentAttempts: number;
  unresolvedMigrations: number;
  missingMigrations: number;
  role: { superuser: boolean; createRole: boolean; createDb: boolean; inherit: boolean; ownsProtectedTables: boolean; inheritsProtectedOwner: boolean };
  immutablePrivileges: { auditSelect: boolean; auditInsert: boolean; auditUpdate: boolean; auditDelete: boolean; auditTruncate: boolean; historySelect: boolean; historyInsert: boolean; historyUpdate: boolean; historyDelete: boolean; historyTruncate: boolean };
};

export function evaluateM9Preflight(snapshot: M9PreflightSnapshot) {
  const programmeMatches = snapshot.programmeEnabled === (snapshot.expectedProgramme === "enabled");
  const restrictedRole = !snapshot.role.superuser && !snapshot.role.createRole && !snapshot.role.createDb && !snapshot.role.inherit && !snapshot.role.ownsProtectedTables && !snapshot.role.inheritsProtectedOwner;
  const p = snapshot.immutablePrivileges;
  const immutableAppendOnly = p.auditSelect && p.auditInsert && p.historySelect && p.historyInsert && !p.auditUpdate && !p.auditDelete && !p.auditTruncate && !p.historyUpdate && !p.historyDelete && !p.historyTruncate;
  const migrationsComplete = snapshot.unresolvedMigrations === 0 && snapshot.missingMigrations === 0;
  return { ready: programmeMatches && restrictedRole && immutableAppendOnly && migrationsComplete, programmeMatches, restrictedRole, immutableAppendOnly, migrationsComplete };
}
