import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { logger } from "@/lib/logger";
import {
  SubmissionExportError,
  createSubmissionsCsv,
  createSubmissionsXlsx,
  getSubmissionExportRows,
} from "@/lib/export/submissions";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  try {
    const session = await getSession();

    if (!session || session.kind !== "admin") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = await db.admin.findUnique({ where: { id: session.subjectId } });

    if (!admin?.active || !hasAdminPermission(admin.role, "exportSubmissions")) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
    const rows = await getSubmissionExportRows({
      q: url.searchParams.get("q") || undefined,
      status: url.searchParams.get("status") || undefined,
      sort: url.searchParams.get("sort") || undefined,
    });

    logger.info("admin_export_created", {
      adminId: admin.id,
      format,
      rowCount: rows.length,
    });

    if (format === "csv") {
      return new Response(createSubmissionsCsv(rows), {
        headers: {
          ...privateHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=submissions.csv",
        },
      });
    }

    const workbook = createSubmissionsXlsx(rows);

    return new Response(new Uint8Array(workbook), {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=submissions.xlsx",
      },
    });
  } catch (error) {
    if (error instanceof SubmissionExportError) {
      logger.warn("admin_export_rejected", { reason: "EXPORT_LIMIT" });
      return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    }
    logger.error("admin_export_failed", error);
    return Response.json({ error: "Export failed" }, { status: 500, headers: privateHeaders });
  }
}
