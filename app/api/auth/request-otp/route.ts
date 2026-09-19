import { guardAuthRequest } from "@/lib/auth/request-guard";
import { ActionError, requestOtp } from "@/lib/actions/auth";
import { verificationClientIp } from "@/lib/auth/verification";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const rejected = guardAuthRequest(request);
  if (rejected) return rejected;

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "قالب درخواست ورود معتبر نیست. صفحه را تازه‌سازی و دوباره تلاش کنید." }, { status: 400 });
  }
  try {
    const result = await requestOtp(input, { clientIp: verificationClientIp(request.headers) });

    return Response.json(result);
  } catch (error) {
    if (error instanceof ActionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    logger.warn("api_request_otp_failed", { reason: "invalid_request" });
    return Response.json({ error: "خطای غیرمنتظره رخ داد" }, { status: 400 });
  }
}
