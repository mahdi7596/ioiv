import { describe, expect, it } from "vitest";
import { getClientIp } from "@/lib/http/client-ip";

describe("getClientIp", () => {
  it("prefers X-Real-IP set by nginx", () => {
    expect(getClientIp(new Headers({ "x-real-ip": "203.0.113.5", "x-forwarded-for": "198.51.100.9, 203.0.113.5" }))).toBe("203.0.113.5");
  });

  it("falls back to the first X-Forwarded-For hop", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": " 198.51.100.9 , 10.0.0.1" }))).toBe("198.51.100.9");
    expect(getClientIp(new Headers({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("returns null for missing or non-IP values", () => {
    expect(getClientIp(new Headers())).toBeNull();
    expect(getClientIp(new Headers({ "x-real-ip": "not-an-ip" }))).toBeNull();
    expect(getClientIp(new Headers({ "x-forwarded-for": "evil.example" }))).toBeNull();
  });
});
