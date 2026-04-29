import { ActionError, requestOtp } from "@/lib/actions/auth";

export async function POST(request: Request) {
  try {
    const input = await request.json();
    const result = await requestOtp(input);

    return Response.json(result);
  } catch (error) {
    if (error instanceof ActionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error(error);
    return Response.json({ error: "خطای غیرمنتظره رخ داد" }, { status: 500 });
  }
}
