import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const SESSION_COOKIE = "sana_session";
const SESSION_MAX_AGE_SECONDS = 60 * 30;

export type SessionKind = "user" | "admin";

export type SessionPayload = {
  subjectId: string;
  kind: SessionKind;
};

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }

  return new TextEncoder().encode(secret);
}

export async function createSession(payload: SessionPayload) {
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getSessionSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export type SessionInspection =
  | { state: "absent" | "invalid" | "unavailable" }
  | { state: "valid"; session: SessionPayload };

export async function inspectSession(): Promise<SessionInspection> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { state: "absent" };
  let secret: Uint8Array;
  try { secret = getSessionSecret(); }
  catch { return { state: "unavailable" }; }
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (typeof payload.subjectId !== "string" || !payload.subjectId ||
        (payload.kind !== "user" && payload.kind !== "admin")) {
      return { state: "invalid" };
    }
    return { state: "valid", session: { subjectId: payload.subjectId, kind: payload.kind } };
  } catch {
    return { state: "invalid" };
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const result = await inspectSession();
  return result.state === "valid" ? result.session : null;
}

export async function requireSession(kind?: SessionKind) {
  const session = await getSession();

  if (!session || (kind && session.kind !== kind)) {
    throw new Error("Unauthorized");
  }

  return session;
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
