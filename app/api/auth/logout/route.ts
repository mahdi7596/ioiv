import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth/session";

/**
 * POST only: a GET logout can be triggered by any third-party page embedding
 * the URL. The stale-cookie loop breaker lives at /api/auth/session-reset.
 */
export async function POST(request: Request) {
  await clearSession();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
