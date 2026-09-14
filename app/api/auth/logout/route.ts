import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth/session";

async function handleLogout(request: Request) {
  await clearSession();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}

export async function POST(request: Request) {
  return handleLogout(request);
}

// GET is supported so it can be used as a redirect target (e.g. when a page
// detects a stale session cookie whose user no longer exists and needs the
// cookie cleared to break an otherwise infinite redirect loop).
export async function GET(request: Request) {
  return handleLogout(request);
}
