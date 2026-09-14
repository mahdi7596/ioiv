import { readFile } from "node:fs/promises";

import { M9_GATES, type M9Gate, validateM9ReleaseDocuments } from "@/lib/facilities-m9/release";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const decisionsPath = option("--decisions");
  const evidencePath = option("--evidence");
  const requestedGate = option("--require-gate");
  if (!decisionsPath || !evidencePath) throw new Error("Usage: --decisions <path> --evidence <path> [--require-gate G0..G7]");
  if (requestedGate && !(M9_GATES as readonly string[]).includes(requestedGate)) throw new Error("--require-gate must be G0 through G7");

  const [decisions, evidence] = await Promise.all([
    readFile(decisionsPath, "utf8").then(JSON.parse),
    readFile(evidencePath, "utf8").then(JSON.parse),
  ]);
  const result = validateM9ReleaseDocuments(decisions, evidence, requestedGate as M9Gate | undefined);
  console.info(JSON.stringify({ event: "facilities_m9_release_validation", valid: result.valid, requiredGate: requestedGate ?? null, errorCount: result.errors.length, pendingCount: result.pending.length, errors: result.errors }));
  if (!result.valid) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ event: "facilities_m9_release_validation_failed", reasonCode: error instanceof SyntaxError ? "INVALID_JSON" : "INVALID_ARGUMENT_OR_FILE" }));
  process.exitCode = 1;
});
