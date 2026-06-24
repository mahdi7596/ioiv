import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const session = await getSession();

    if (!session || session.kind !== "admin") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = await db.admin.findUnique({ where: { id: session.subjectId } });

    if (!admin || !admin.active || admin.role !== UserRole.KALAN_HESAB_ADMIN) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim();

    const submissions = await db.kalanHesabSubmission.findMany({
      where: search
        ? {
            OR: [
              { fullName: { contains: search } },
              { companyName: { contains: search } },
              { mobile: { contains: search } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ submissions });
  } catch (error) {
    logger.error("kalan_hesab_submissions_fetch_failed", error);
    return Response.json({ error: "خطای غیرمنتظره رخ داد" }, { status: 500 });
  }
}
