import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  M9_DECISION_IDS,
  M9_GATES,
  buildCandidateManifest,
  evaluateM9Preflight,
  validateM9ReleaseDocuments,
  type M9PreflightSnapshot,
} from "@/lib/facilities-m9/release";

function pendingDocuments() {
  return {
    decisions: {
      schemaVersion: 1,
      releaseId: "release-1",
      decisions: M9_DECISION_IDS.map((id) => ({ id, status: "pending", evidenceRef: "pending://approval" })),
    },
    evidence: {
      schemaVersion: 1,
      releaseId: "release-1",
      candidateId: "PENDING",
      configurationId: "PENDING",
      gates: M9_GATES.map((id) => ({ id, status: "pending", checks: [] })),
    },
  };
}

describe("M9 release record validation", () => {
  it("accepts structurally complete pending templates without presenting a passed gate", () => {
    const documents = pendingDocuments();
    const result = validateM9ReleaseDocuments(documents.decisions, documents.evidence);
    expect(result.valid).toBe(true);
    expect(result.pending).toHaveLength(M9_DECISION_IDS.length + M9_GATES.length);
  });

  it("fails closed when a requested gate or its decisions are pending", () => {
    const documents = pendingDocuments();
    const result = validateM9ReleaseDocuments(documents.decisions, documents.evidence, "G1");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("required gate 'G0' has not passed");
    expect(result.errors).toContain("required gate 'G1' has not passed");
    expect(validateM9ReleaseDocuments(documents.decisions, documents.evidence, "G0").errors).toContain("gate 'G0' requires every G0 decision to be approved");
  });

  it("rejects out-of-order passed gates and incomplete checks", () => {
    const documents = pendingDocuments();
    documents.evidence.gates[1] = { id: "G1", status: "passed", checks: [] };
    const result = validateM9ReleaseDocuments(documents.decisions, documents.evidence);
    expect(result.errors).toContain("passed gate 'G1' has no valid completion timestamp");
    expect(result.errors).toContain("passed gate 'G1' has no checks");
    expect(result.errors).toContain("gate 'G1' passed before dependency 'G0'");
    expect(result.errors).toContain("passed gates require final candidate and configuration identities");
  });

  it("rejects a passed G0 with unresolved decisions and unsupported fields", () => {
    const documents = pendingDocuments();
    documents.evidence.candidateId = "candidate-a";
    documents.evidence.configurationId = "config-a";
    documents.evidence.gates[0] = { id: "G0", status: "passed", checks: [] };
    const result = validateM9ReleaseDocuments({ ...documents.decisions, unexpected: true }, documents.evidence);
    expect(result.errors).toContain("gate 'G0' cannot pass with unresolved decisions");
    expect(result.errors).toContain("decision register contains unsupported field 'unexpected'");
  });

  it("rejects secret-bearing fields without echoing their values", () => {
    const documents = pendingDocuments();
    const decisions = { ...documents.decisions, databaseUrl: "postgresql://owner:do-not-print@example/db" };
    const result = validateM9ReleaseDocuments(decisions, documents.evidence);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).not.toContain("do-not-print");
    expect(result.errors.join(" ")).toContain("prohibited field");
  });
});

describe("M9 candidate manifest", () => {
  it("sorts and hashes release inputs deterministically", () => {
    const input = { sourceSha: "a".repeat(40), dirtyPaths: [], generatedAt: "2026-09-12T00:00:00.000Z" };
    const first = buildCandidateManifest({ ...input, files: [{ path: "z", bytes: Buffer.from("z") }, { path: "a", bytes: Buffer.from("a") }] });
    const second = buildCandidateManifest({ ...input, files: [{ path: "a", bytes: Buffer.from("a") }, { path: "z", bytes: Buffer.from("z") }] });
    expect(first.files.map((file) => file.path)).toEqual(["a", "z"]);
    expect(first.releaseInputsSha256).toBe(second.releaseInputsSha256);
    expect(first.externalArtifacts.candidateImageDigest).toBe("PENDING");
  });

  it("rejects a dirty candidate and abbreviated SHA", () => {
    expect(() => buildCandidateManifest({ sourceSha: "a".repeat(40), dirtyPaths: ["package.json"], files: [] })).toThrow("not clean");
    expect(() => buildCandidateManifest({ sourceSha: "abc", dirtyPaths: [], files: [] })).toThrow("full 40-character");
  });
});

function safePreflight(overrides: Partial<M9PreflightSnapshot> = {}): M9PreflightSnapshot {
  return {
    expectedProgramme: "disabled",
    programmeEnabled: false,
    enabledIntakes: 0,
    enabledIntakeSuppliers: 0,
    activePaymentAttempts: 0,
    unresolvedMigrations: 0,
    missingMigrations: 0,
    role: { superuser: false, createRole: false, createDb: false, inherit: false, ownsProtectedTables: false, inheritsProtectedOwner: false },
    immutablePrivileges: { auditSelect: true, auditInsert: true, auditUpdate: false, auditDelete: false, auditTruncate: false, historySelect: true, historyInsert: true, historyUpdate: false, historyDelete: false, historyTruncate: false },
    ...overrides,
  };
}

describe("M9 preflight evaluation", () => {
  it("passes a disabled, migrated, restricted append-only runtime snapshot", () => {
    expect(evaluateM9Preflight(safePreflight()).ready).toBe(true);
  });

  it("fails availability mismatch, privileged runtime, mutable history, and missing migrations", () => {
    expect(evaluateM9Preflight(safePreflight({ programmeEnabled: true })).ready).toBe(false);
    expect(evaluateM9Preflight(safePreflight({ role: { ...safePreflight().role, superuser: true } })).restrictedRole).toBe(false);
    expect(evaluateM9Preflight(safePreflight({ role: { ...safePreflight().role, inherit: true } })).restrictedRole).toBe(false);
    expect(evaluateM9Preflight(safePreflight({ immutablePrivileges: { ...safePreflight().immutablePrivileges, auditTruncate: true } })).immutableAppendOnly).toBe(false);
    expect(evaluateM9Preflight(safePreflight({ missingMigrations: 1 })).migrationsComplete).toBe(false);
  });
});

describe("M9 container packaging", () => {
  it("separates migration tooling and keeps runtime maintenance scripts available", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");
    const compose = readFileSync("docker-compose.yml", "utf8");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    expect(dockerfile).toContain("FROM base AS maintenance");
    expect(dockerfile).toContain("rm -rf node_modules/prisma node_modules/@prisma");
    expect(dockerfile).toContain("COPY --from=builder /app/scripts ./scripts");
    expect(dockerfile).toContain("COPY --from=builder /app/tsconfig.json ./tsconfig.json");
    expect(dockerfile).toContain("COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client");
    expect(compose).toMatch(/migrate:[\s\S]*target: maintenance/);
    expect(packageJson.dependencies.prisma).toBeUndefined();
    expect(packageJson.devDependencies.prisma).toBeDefined();
  });
});
