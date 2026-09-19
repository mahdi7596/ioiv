import { NextResponse } from "next/server";
import { clearSession, inspectSession } from "@/lib/auth/session";
import { configuredAuthOrigin } from "@/lib/auth/request-guard";
import { db } from "@/lib/db";

/** Recover unusable cookies without allowing navigation to destroy a valid session. */
export async function GET() {
  try {
    const origin = configuredAuthOrigin();
    const inspection = await inspectSession();
    if (inspection.state === "unavailable") throw new Error("Session unavailable");
    const session = inspection.state === "valid" ? inspection.session : null;
    if (session) {
      const valid = session.kind === "admin"
        ? (await db.admin.findUnique({ where: { id: session.subjectId }, select: { active: true } }))?.active
        : Boolean(await db.user.findUnique({ where: { id: session.subjectId }, select: { id: true } }));
      if (valid) {
        return NextResponse.redirect(new URL(session.kind === "admin" ? "/admin" : "/dashboard", origin),
          { status: 303, headers: { "Cache-Control": "no-store" } });
      }
    }
    if (inspection.state !== "absent") await clearSession();
    return NextResponse.redirect(new URL(session?.kind === "admin" ? "/admin/login?session=reset" : "/?session=reset", origin),
      { status: 303, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "بررسی نشست موقتاً در دسترس نیست. لطفاً کمی بعد صفحه را تازه‌سازی کنید." },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
