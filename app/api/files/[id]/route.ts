import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export async function GET(_request: Request, context: RouteContext<"/api/files/[id]">) {
  const { id } = await context.params;
  const session = await getSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const file = await db.applicationFile.findUnique({
    where: { id },
    include: {
      application: true,
    },
  });

  if (!file) {
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  if (session.kind === "user" && file.application.userId !== session.subjectId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (session.kind === "admin") {
    const admin = await db.admin.findUnique({ where: { id: session.subjectId } });

    if (!admin?.active) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const bytes = await readFile(file.storagePath);
  const encodedName = encodeURIComponent(path.basename(file.originalName));

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
    },
  });
}
