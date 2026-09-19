/** Trust only deployment configuration, never Host or proxy-provided headers. */
export function configuredAuthOrigin(): string {
    const raw = process.env.APP_URL?.trim();
    if (!raw) throw new Error("missing configuration");
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash ||
        (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
      throw new Error("invalid configuration");
    }
    return url.origin;
}

export function guardSessionMutationOrigin(request: Request): Response | null {
  let origin: string;
  try { origin = configuredAuthOrigin(); } catch {
    return Response.json({ error: "ورود موقتاً در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید." }, { status: 503 });
  }

  // Origin is a serialized origin, not an arbitrary URL. Exact comparison also
  // rejects null, missing, lists, credentials, paths and ambiguous spellings.
  if (request.headers.get("origin") !== origin) {
    return Response.json({ error: "درخواست ورود معتبر نیست. صفحه را تازه‌سازی و دوباره تلاش کنید." }, { status: 403 });
  }
  return null;
}

export function guardAuthRequest(request: Request): Response | null {
  const denied = guardSessionMutationOrigin(request);
  if (denied) return denied;
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(contentType)) {
    return Response.json({ error: "قالب درخواست ورود معتبر نیست. صفحه را تازه‌سازی و دوباره تلاش کنید." }, { status: 415 });
  }
  return null;
}
