import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ count: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { application: { count: mocks.count, findMany: mocks.findMany } } }));

import { MAX_SUBMISSION_EXPORT_ROWS, getSubmissionExportRows } from "@/lib/export/submissions";

describe("legacy export row cap", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.findMany.mockResolvedValue([]); });

  it("counts before loading and refuses oversized exports", async () => {
    mocks.count.mockResolvedValue(MAX_SUBMISSION_EXPORT_ROWS + 1);
    await expect(getSubmissionExportRows({ status: "SUBMITTED" })).rejects.toMatchObject({ status: 422 });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("loads with the same filter it counted", async () => {
    mocks.count.mockResolvedValue(3);
    await expect(getSubmissionExportRows({ q: "0912", status: "SUBMITTED" })).resolves.toEqual([]);
    const where = mocks.count.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: "SUBMITTED" });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
  });
});
