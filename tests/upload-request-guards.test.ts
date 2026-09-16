import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { UploadRateLimiter } from "@/lib/uploads/rate-limit";
import { MULTIPART_OVERHEAD_BYTES, admitUpload, rejectOversizedUploadRequest } from "@/lib/uploads/request-guards";

function request(headers: Record<string, string> = {}) {
  return new Request("http://test.local/api/uploads", { method: "POST", headers, body: "x" });
}

describe("upload request guards", () => {
  it("rejects a declared body larger than the file limit plus multipart overhead before any parsing", async () => {
    const limit = 25 * 1024 * 1024;

    const tooLarge = rejectOversizedUploadRequest(request({ "content-length": String(limit + MULTIPART_OVERHEAD_BYTES + 1) }), limit);
    expect(tooLarge?.status).toBe(413);
    await expect(tooLarge?.json()).resolves.toMatchObject({ error: expect.stringContaining("حجم درخواست") });

    expect(rejectOversizedUploadRequest(request({ "content-length": String(limit + MULTIPART_OVERHEAD_BYTES) }), limit)).toBeNull();
    expect(rejectOversizedUploadRequest(request({ "content-length": "-5" }), limit)?.status).toBe(400);
    expect(rejectOversizedUploadRequest(request({ "content-length": "abc" }), limit)?.status).toBe(400);
  });

  it("leaves a body without a declared length to the reverse proxy", () => {
    expect(rejectOversizedUploadRequest(request(), 1024)).toBeNull();
  });

  it("turns a denied admission into a 429 with a retry hint and never holds a slot", async () => {
    const limiter = new UploadRateLimiter({ maxInFlightPerUser: 1, maxInFlightGlobal: 2, maxPerUserPerHour: 10, maxPerIpPerHour: 10 });
    const held = admitUpload(request({ "x-real-ip": "5.5.5.5" }), "user-1", limiter);
    expect(held.ok).toBe(true);

    const denied = admitUpload(request({ "x-real-ip": "5.5.5.5" }), "user-1", limiter);
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.response.status).toBe(429);
      expect(denied.response.headers.get("Retry-After")).toBe("60");
      await expect(denied.response.json()).resolves.toMatchObject({ code: "USER_IN_FLIGHT" });
    }

    if (held.ok) held.release();
    const again = admitUpload(request({ "x-real-ip": "5.5.5.5" }), "user-1", limiter);
    expect(again.ok).toBe(true);
    if (again.ok) again.release();
  });
});
