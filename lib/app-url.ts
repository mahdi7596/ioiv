/**
 * The public origin used to build payment-gateway callback URLs. There is no
 * default on purpose: a silent localhost fallback in production would send
 * users back to the wrong host after the bank page.
 */
export function requireAppUrl(): string {
  const raw = process.env.APP_URL?.trim();
  if (!raw) {
    throw new Error("APP_URL must be set (for example https://sana.ioiv.ir); it builds the payment callback URL");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("APP_URL must be an absolute http(s) URL");
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error("APP_URL must be an absolute http(s) URL");
  }

  return url.toString().replace(/\/$/, "");
}
