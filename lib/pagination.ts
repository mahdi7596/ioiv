import { ActionError } from "@/lib/actions/auth";

export const ADMIN_PAGE_SIZE = 50;
const IDENTIFIER = /^[A-Za-z0-9_-]{1,100}$/;
const MAX_CURSOR_LENGTH = 300;

/** Keyset cursor: the sort timestamp and id of the last row on the previous page. */
export type KeysetCursor = { at: Date; id: string };

export function encodeKeysetCursor(cursor: { at: Date | string; id: string }): string {
  const at = cursor.at instanceof Date ? cursor.at.toISOString() : cursor.at;
  return Buffer.from(JSON.stringify({ at, id: cursor.id }), "utf8").toString("base64url");
}

/** Returns undefined for a missing cursor and throws a 400 ActionError for a malformed one. */
export function decodeKeysetCursor(value?: string | null): KeysetCursor | undefined {
  if (!value) return undefined;
  if (value.length > MAX_CURSOR_LENGTH) throw new ActionError("نشانگر صفحه معتبر نیست", 400);
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { at?: unknown; id?: unknown };
    const at = new Date(String(parsed.at));
    if (typeof parsed.id !== "string" || !IDENTIFIER.test(parsed.id) || Number.isNaN(at.getTime())) throw new Error();
    return { at, id: parsed.id };
  } catch {
    throw new ActionError("نشانگر صفحه معتبر نیست", 400);
  }
}

/**
 * Where-clause fragment selecting rows after the cursor in (field, id) order.
 * Spread it into an AND so it never interferes with the caller's own OR filters.
 */
export function keysetWhere(field: string, cursor: KeysetCursor, direction: "asc" | "desc") {
  const operator = direction === "desc" ? "lt" : "gt";
  return { OR: [{ [field]: { [operator]: cursor.at } }, { [field]: cursor.at, id: { [operator]: cursor.id } }] };
}

/** Trims a `take: pageSize + 1` result to one page and encodes the next cursor. */
export function sliceKeysetPage<T extends { id: string }>(found: T[], at: (row: T) => Date, pageSize = ADMIN_PAGE_SIZE): { rows: T[]; nextCursor: string | null } {
  const rows = found.slice(0, pageSize);
  const last = rows.at(-1);
  const nextCursor = found.length > pageSize && last ? encodeKeysetCursor({ at: at(last), id: last.id }) : null;
  return { rows, nextCursor };
}
