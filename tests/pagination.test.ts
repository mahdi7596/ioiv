import { describe, expect, it } from "vitest";
import { ADMIN_PAGE_SIZE, decodeKeysetCursor, encodeKeysetCursor, keysetWhere, sliceKeysetPage } from "@/lib/pagination";

describe("keyset pagination helpers", () => {
  it("round-trips a cursor and rejects malformed ones", () => {
    const at = new Date("2026-09-16T10:00:00.000Z");
    expect(decodeKeysetCursor(encodeKeysetCursor({ at, id: "app_1" }))).toEqual({ at, id: "app_1" });
    expect(decodeKeysetCursor(undefined)).toBeUndefined();
    expect(decodeKeysetCursor("")).toBeUndefined();
    expect(() => decodeKeysetCursor("bad")).toThrow("نشانگر صفحه معتبر نیست");
    expect(() => decodeKeysetCursor(Buffer.from(JSON.stringify({ at: "2026-09-16", id: "../x" })).toString("base64url"))).toThrow("نشانگر");
    expect(() => decodeKeysetCursor("a".repeat(301))).toThrow("نشانگر");
  });

  it("flips comparison operators with the sort direction", () => {
    const cursor = { at: new Date("2026-09-16T10:00:00.000Z"), id: "app_9" };
    expect(keysetWhere("createdAt", cursor, "desc")).toEqual({ OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: "app_9" } }] });
    expect(keysetWhere("updatedAt", cursor, "asc")).toEqual({ OR: [{ updatedAt: { gt: cursor.at } }, { updatedAt: cursor.at, id: { gt: "app_9" } }] });
  });

  it("returns one page plus a cursor only when more rows exist", () => {
    const rows = Array.from({ length: ADMIN_PAGE_SIZE + 1 }, (_, index) => ({ id: `app_${index}`, createdAt: new Date(2026, 0, 1, 0, index) }));
    const full = sliceKeysetPage(rows, (row) => row.createdAt);
    expect(full.rows).toHaveLength(ADMIN_PAGE_SIZE);
    expect(decodeKeysetCursor(full.nextCursor!)).toEqual({ at: rows[ADMIN_PAGE_SIZE - 1].createdAt, id: rows[ADMIN_PAGE_SIZE - 1].id });

    const partial = sliceKeysetPage(rows.slice(0, ADMIN_PAGE_SIZE), (row) => row.createdAt);
    expect(partial.rows).toHaveLength(ADMIN_PAGE_SIZE);
    expect(partial.nextCursor).toBeNull();
    expect(sliceKeysetPage([], () => new Date()).nextCursor).toBeNull();
  });
});
