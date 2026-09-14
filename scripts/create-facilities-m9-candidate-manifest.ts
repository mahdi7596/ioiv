import { execFileSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildCandidateManifest, type CandidateFile } from "@/lib/facilities-m9/release";

const fixedInputs = [
  "package-lock.json",
  "package.json",
  "prisma/schema.prisma",
  "prisma/facilities-runtime-role-grants.sql",
  "prisma/facilities-runtime-role-provision.sql",
  "Dockerfile",
  "Dockerfile.prisma-export",
  "docker-compose.yml",
  ".env.runtime.example",
  ".env.migration.example",
  "DEPLOYMENT.md",
  "docs/2026-09-12-facilities-m9-controlled-rollout-plan.md",
  "lib/facilities-m9/release.ts",
] as const;

function git(...args: string[]) {
  return execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function recursiveFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.posix.join(directory, entry.name);
    return entry.isDirectory() ? recursiveFiles(target) : [target];
  }));
  return nested.flat();
}

async function main() {
  const outputIndex = process.argv.indexOf("--output");
  const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  if (outputIndex >= 0 && !outputPath) throw new Error("--output requires a file path");

  const sourceSha = git("rev-parse", "HEAD");
  const dirtyPaths = git("status", "--porcelain=v1", "--untracked-files=all").split("\n").filter(Boolean).map((line) => line.slice(3));
  const migrations = (await recursiveFiles("prisma/migrations")).filter((file) => file.endsWith("/migration.sql") || file.endsWith("migration_lock.toml"));
  const operational = (await recursiveFiles("operations/facilities-m9")).filter((file) => !file.endsWith(".example.json"));
  const scripts = (await recursiveFiles("scripts")).filter((file) => file.includes("facilities") || file.endsWith("reconcile-facilities-files.ts"));
  const openSpec = await recursiveFiles("openspec/changes/implement-facilities-m9-controlled-rollout");
  const inputPaths = [...new Set([...fixedInputs, ...migrations, ...operational, ...scripts, ...openSpec])].sort();
  const files: CandidateFile[] = await Promise.all(inputPaths.map(async (inputPath) => ({ path: inputPath, bytes: await readFile(inputPath) })));
  const manifest = buildCandidateManifest({ sourceSha, dirtyPaths, files });
  const rendered = `${JSON.stringify(manifest, null, 2)}\n`;
  if (outputPath) await writeFile(outputPath, rendered, { encoding: "utf8", flag: "wx", mode: 0o600 });
  else process.stdout.write(rendered);
}

main().catch((error: unknown) => {
  const reasonCode = error instanceof Error && error.message === "Candidate worktree is not clean" ? "DIRTY_WORKTREE" : "MANIFEST_GENERATION_FAILED";
  console.error(JSON.stringify({ event: "facilities_m9_manifest_failed", reasonCode }));
  process.exitCode = 1;
});
