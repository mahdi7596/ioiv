import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth/session";

/**
 * GET target for server components that detect a session cookie whose subject
 * no longer exists (for example after a database reseed). Redirecting to "/"
 * alone would loop because "/" trusts the cookie, so the cookie is cleared
 * here first. Clearing a cookie is the only side effect, and the same cookie is
 * already invalid, so a cross-site GET gains nothing.
 */
export async function GET(request: Request) {
  await clearSession();
  return NextResponse.redirect(new URL("/?session=reset", request.url), { status: 303 });
}
