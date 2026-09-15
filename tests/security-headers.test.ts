import { describe, expect, it } from "vitest";
import nextConfig, { securityHeaders } from "@/next.config";

const header = (key: string) => securityHeaders.find((item) => item.key === key)?.value ?? "";

describe("security headers", () => {
  it("applies the header set to every route", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toEqual([{ source: "/(.*)", headers: securityHeaders }]);
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("keeps Next.js inline scripts working while blocking framing and third-party origins", () => {
    const csp = header("Content-Security-Policy");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("img-src 'self' data: https://trustseal.enamad.ir");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("sets HSTS, nosniff, and clickjacking headers", () => {
    expect(header("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("X-Frame-Options")).toBe("DENY");
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});
