import { changeSubmissionStatus } from "@/lib/actions/admin";
import { ActionError } from "@/lib/actions/auth";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    await changeSubmissionStatus(formData);

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ActionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    logger.error("api_admin_status_change_failed", error);
    return Response.json({ error: "خطای غیرمنتظره رخ داد" }, { status: 500 });
  }
}
