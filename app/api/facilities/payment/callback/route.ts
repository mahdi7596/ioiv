import { redirect } from "next/navigation";

import { verifyFacilitiesPaymentCallback } from "@/lib/actions/facilities-payment";

function returnUrl(state: "success" | "failed" | "pending") {
  return `/dashboard/facilities-application?payment=${state}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const paymentId = url.searchParams.get("paymentId");
  const authority = url.searchParams.get("Authority");
  const gatewayStatus = url.searchParams.get("Status");

  if (!paymentId || !authority) redirect(returnUrl("failed"));

  const result = await verifyFacilitiesPaymentCallback({ paymentId, authority, gatewayStatus });
  redirect(returnUrl(result.state));
}
