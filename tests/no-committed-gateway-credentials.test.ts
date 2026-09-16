import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for audit finding P7: the production Zarinpal merchant ID
 * was once committed in operational docs. Zarinpal v4 has no separate secret,
 * so the merchant ID is the whole gateway credential surface; it must only ever
 * appear in `.env*` files, which are git-ignored, or as an obvious placeholder
 * in an `.example` file.
 *
 * The scan runs over tracked text files only, never over history, and looks for
 * a real UUID sitting next to a merchant-id key. Placeholders made of a single
 * repeated hex digit (for example 11111111-1111-...) are allowed so tests and
 * examples stay readable.
 */
const MERCHANT_ID_ASSIGNMENT = /(zarinpal[_-]?merchant[_-]?id|merchant[_ -]?id)\s*[:=]\s*["'`]?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
const PLACEHOLDER = /^([0-9a-f])\1{7}-\1{4}-\1{4}-\1{4}-\1{12}$/i;
const SKIPPED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".ico", ".pdf", ".docx", ".xlsx", ".zip", ".gz", ".tgz", ".woff", ".woff2", ".ttf", ".node"]);

function trackedFiles(root: string): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root })
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((file) => !SKIPPED_EXTENSIONS.has(path.extname(file).toLowerCase()));
}

describe("gateway credentials are never committed", () => {
  it("finds no real merchant id next to a merchant-id key in any tracked file", () => {
    const root = process.cwd();
    const offenders: string[] = [];

    for (const file of trackedFiles(root)) {
      let text: string;
      try {
        text = readFileSync(path.join(root, file), "utf8");
      } catch {
        continue;
      }
      for (const match of text.matchAll(MERCHANT_ID_ASSIGNMENT)) {
        if (!PLACEHOLDER.test(match[2])) offenders.push(`${file}: ${match[1]} = <uuid>`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the merchant id key only in example env files and the gateway client", () => {
    const root = process.cwd();
    const holders = trackedFiles(root).filter((file) => {
      try {
        return /ZARINPAL_MERCHANT_ID/.test(readFileSync(path.join(root, file), "utf8"));
      } catch {
        return false;
      }
    });

    // Every holder must be an example env file, documentation, the gateway
    // client, or a test; a real `.env*` file must never be tracked at all.
    expect(holders.filter((file) => /^\.env(?!.*\.example$)/.test(path.basename(file)))).toEqual([]);
    expect(holders.every((file) => /\.example$|\.md$|^lib\/payments\/|^tests\/|^scripts\/|^docker-compose|^Dockerfile/.test(file))).toBe(true);
  });
});
