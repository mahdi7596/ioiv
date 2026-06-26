import { UserRole } from "@prisma/client";
import * as XLSX from "xlsx";
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

    const submissions = await db.kalanHesabSubmission.findMany({
      orderBy: { createdAt: "desc" },
    });

    const rows = submissions.map((s) => ({
      "نام و نام خانوادگی": s.fullName,
      "نام شرکت": s.companyName,
      سمت: s.position === "سایر" && s.positionOther ? s.positionOther : s.position,
      "اندازه تیم": s.teamSize,
      دغدغه: s.mainConcern === "سایر" && s.concernOther ? s.concernOther : s.mainConcern,
      موبایل: s.mobile,
      "تاریخ ثبت": new Intl.DateTimeFormat("fa-IR-u-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" }).format(s.createdAt),
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "submissions");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    logger.info("kalan_hesab_export_created", {
      adminId: admin.id,
      rowCount: rows.length,
    });

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=kalan-hesab-submissions.xlsx",
      },
    });
  } catch (error) {
    logger.error("kalan_hesab_export_failed", error);
    return Response.json({ error: "خطای غیرمنتظره رخ داد" }, { status: 500 });
  }
}
