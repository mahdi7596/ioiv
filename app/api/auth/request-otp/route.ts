import { ActionError, requestOtp } from "@/lib/actions/auth";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const input = await request.json();
    const result = await requestOtp(input);

    return Response.json(result);
  } catch (error) {
    if (error instanceof ActionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    logger.error("api_request_otp_failed", error);
    return Response.json({ error: "خطای غیرمنتظره رخ داد" }, { status: 500 });
  }
}
