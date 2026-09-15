import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

/**
 * Liveness plus a database ping for the Compose healthcheck. Deliberately
 * unauthenticated and content-free so it reveals nothing about the deployment.
 */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers });
  }
}
