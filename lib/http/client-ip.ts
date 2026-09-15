import { isIP } from "node:net";

/**
 * Best-effort client address for rate limiting. nginx sets X-Real-IP from
 * $remote_addr, which a client cannot forge; the first X-Forwarded-For hop is
 * only a fallback. Returns null when neither header carries a literal IP, in
 * which case callers must skip IP-based limits rather than fail.
 */
export function getClientIp(headers: Headers): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real && isIP(real)) return real;

  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded && isIP(forwarded)) return forwarded;

  return null;
}
