import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
  verifyFacilitiesPaymentCallback: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/actions/facilities-payment", () => ({ verifyFacilitiesPaymentCallback: mocks.verifyFacilitiesPaymentCallback }));

describe("facilities payment callback route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("treats missing callback identifiers as a failed untrusted return", async () => {
    const { GET } = await import("@/app/api/facilities/payment/callback/route");
    await expect(GET(new Request("https://sana.ioiv.ir/api/facilities/payment/callback"))).rejects.toThrow("NEXT_REDIRECT:/dashboard/facilities-application?payment=failed");
    expect(mocks.verifyFacilitiesPaymentCallback).not.toHaveBeenCalled();
  });

  it("passes browser parameters to the server verifier and redirects only on its result", async () => {
    mocks.verifyFacilitiesPaymentCallback.mockResolvedValue({ state: "success" });
    const { GET } = await import("@/app/api/facilities/payment/callback/route");
    await expect(GET(new Request("https://sana.ioiv.ir/api/facilities/payment/callback?paymentId=pay_1&Authority=auth_1&Status=OK"))).rejects.toThrow("NEXT_REDIRECT:/dashboard/facilities-application?payment=success");
    expect(mocks.verifyFacilitiesPaymentCallback).toHaveBeenCalledWith({ paymentId: "pay_1", authority: "auth_1", gatewayStatus: "OK" });
  });

  it("renders a safe pending result for a delayed or unknown callback", async () => {
    mocks.verifyFacilitiesPaymentCallback.mockResolvedValue({ state: "pending" });
    const { GET } = await import("@/app/api/facilities/payment/callback/route");
    await expect(GET(new Request("https://sana.ioiv.ir/api/facilities/payment/callback?paymentId=pay_1&Authority=auth_1&Status=OK"))).rejects.toThrow("NEXT_REDIRECT:/dashboard/facilities-application?payment=pending");
  });
});
