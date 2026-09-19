import { NextResponse } from "next/server";
import { configuredAuthOrigin, guardSessionMutationOrigin } from "@/lib/auth/request-guard";
import { clearSession } from "@/lib/auth/session";

/**
 * POST only: a GET logout can be triggered by any third-party page embedding
 * the URL. The stale-cookie loop breaker lives at /api/auth/session-reset.
 */
export async function POST(request: Request) {
  const denied = guardSessionMutationOrigin(request);
  if (denied) return denied;
  await clearSession();
  return NextResponse.redirect(new URL("/", configuredAuthOrigin()), { status: 303, headers: { "Cache-Control": "no-store" } });
}
