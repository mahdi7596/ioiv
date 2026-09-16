import { describe, expect, it } from "vitest";

import { UploadRateLimiter, uploadLimitsFromEnv } from "@/lib/uploads/rate-limit";

const limits = { maxInFlightPerUser: 1, maxInFlightGlobal: 2, maxPerUserPerHour: 3, maxPerIpPerHour: 4 };

describe("upload rate limiter", () => {
  it("bounds in-flight uploads per user and globally, and frees the slot on release", () => {
    const limiter = new UploadRateLimiter(limits);

    const first = limiter.admit({ subjectId: "u1", clientIp: "1.1.1.1", now: 0 });
    expect(first.ok).toBe(true);
    expect(limiter.admit({ subjectId: "u1", clientIp: "1.1.1.1", now: 0 })).toEqual({ ok: false, reason: "USER_IN_FLIGHT" });

    const second = limiter.admit({ subjectId: "u2", clientIp: "1.1.1.2", now: 0 });
    expect(second.ok).toBe(true);
    expect(limiter.admit({ subjectId: "u3", clientIp: "1.1.1.3", now: 0 })).toEqual({ ok: false, reason: "GLOBAL_IN_FLIGHT" });

    if (first.ok) { first.release(); first.release(); }
    const third = limiter.admit({ subjectId: "u3", clientIp: "1.1.1.3", now: 0 });
    expect(third.ok).toBe(true);
    if (second.ok) second.release();
    if (third.ok) third.release();
  });

  it("applies sliding hourly windows per user and per client address", () => {
    const limiter = new UploadRateLimiter(limits);
    const hour = 60 * 60 * 1000;
    const admitAndRelease = (subjectId: string, clientIp: string | null, now: number) => {
      const admission = limiter.admit({ subjectId, clientIp, now });
      if (admission.ok) admission.release();
      return admission;
    };

    for (let index = 0; index < 3; index += 1) expect(admitAndRelease("u1", "9.9.9.9", index).ok).toBe(true);
    expect(admitAndRelease("u1", "9.9.9.9", 10)).toEqual({ ok: false, reason: "USER_HOURLY" });
    // A different account from the same address shares the address budget (3 used of 4).
    expect(admitAndRelease("u2", "9.9.9.9", 11).ok).toBe(true);
    expect(admitAndRelease("u3", "9.9.9.9", 12)).toEqual({ ok: false, reason: "IP_HOURLY" });
    // Unknown address: only the per-user window applies.
    expect(admitAndRelease("u4", null, 13).ok).toBe(true);
    // The window slides: the first user's oldest entries expire after an hour.
    expect(admitAndRelease("u1", "8.8.8.8", hour + 1).ok).toBe(true);
  });

  it("reads limits from the environment with safe fallbacks", () => {
    expect(uploadLimitsFromEnv({})).toEqual({ maxInFlightPerUser: 2, maxInFlightGlobal: 6, maxPerUserPerHour: 60, maxPerIpPerHour: 120 });
    expect(uploadLimitsFromEnv({ UPLOAD_MAX_IN_FLIGHT_GLOBAL: "3", UPLOAD_MAX_PER_USER_PER_HOUR: "0", UPLOAD_MAX_PER_IP_PER_HOUR: "abc" })).toMatchObject({ maxInFlightGlobal: 3, maxPerUserPerHour: 60, maxPerIpPerHour: 120 });
  });
});
