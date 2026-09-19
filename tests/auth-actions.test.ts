import { ADMIN_REQUEST_MESSAGE } from "@/lib/auth/admin-response";
import { OtpPurpose, UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestOtp, verifyOtp } from "@/lib/actions/auth";

const mocks = vi.hoisted(() => ({
  waitResponse: vi.fn(),
  db: {
    $transaction: vi.fn(),
    admin: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    application: {
      findFirst: vi.fn(),
    },
    otpCode: {
      findFirst: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  reserveRequest: vi.fn(),
  claimDispatch: vi.fn(),
  reserveBudget: vi.fn(),
  reserveGuess: vi.fn(),
  consume: vi.fn(),
  bcryptCompare: vi.fn(),
  createSession: vi.fn(),
  sendSms: vi.fn(),
}));

vi.mock("@/lib/auth/admin-response", async original => ({
  ...await original<typeof import("@/lib/auth/admin-response")>(),
  waitForAdminResponse: mocks.waitResponse,
}));

vi.mock("@/lib/auth/request", async original => ({
  ...await original<typeof import("@/lib/auth/request")>(),
  reserveOtpRequest: mocks.reserveRequest,
  claimOtpDispatch: mocks.claimDispatch,
}));

vi.mock("@/lib/auth/verification", async original => ({
  ...await original<typeof import("@/lib/auth/verification")>(),
  reserveVerificationBudget: mocks.reserveBudget,
  reserveOtpGuess: mocks.reserveGuess,
  consumeOtpForSession: mocks.consume,
}));

vi.mock("@/lib/db", () => ({
  db: mocks.db,
}));

vi.mock("@/lib/sms", () => ({
  sendSms: mocks.sendSms,
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async () => "hashed-otp"),
    compare: mocks.bcryptCompare,
  },
}));

vi.mock("@/lib/auth/session", () => ({
  createSession: mocks.createSession,
}));

describe("auth actions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T10:00:00.000Z"));
    vi.clearAllMocks();
    mocks.db.$transaction.mockImplementation(async callback => callback(mocks.db));
    mocks.waitResponse.mockResolvedValue(undefined);
    mocks.db.admin.findUnique.mockResolvedValue({
      id: "admin-1",
      active: true,
      role: UserRole.ADMIN,
    });
    mocks.db.user.findUnique.mockResolvedValue(null);
    mocks.db.user.findFirst.mockResolvedValue(null);
    mocks.db.user.create.mockResolvedValue({ id: "user-1" });
    mocks.db.application.findFirst.mockResolvedValue(null);
    mocks.db.otpCode.findFirst.mockResolvedValue(null);
    mocks.db.otpCode.count.mockResolvedValue(0);
    mocks.db.otpCode.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.otpCode.create.mockResolvedValue({ id: "otp-1" });
    mocks.db.otpCode.update.mockResolvedValue({ id: "otp-1" });
    mocks.reserveRequest.mockResolvedValue({ id: "intent-1", mobileKey: "protected" });
    mocks.claimDispatch.mockResolvedValue(true);
    mocks.reserveBudget.mockResolvedValue(true);
    mocks.reserveGuess.mockResolvedValue({ id: "otp-1", codeHash: "hashed-otp" });
    mocks.consume.mockResolvedValue({ subjectId: "user-1", kind: "user" });
    mocks.bcryptCompare.mockResolvedValue(true);
    mocks.createSession.mockResolvedValue(undefined);
    mocks.sendSms.mockResolvedValue({ ok: true });
  });

  it("invalidates older unused OTPs before creating a replacement", async () => {
    await requestOtp({ mobile: "09123456789", mode: "admin" });

    expect(mocks.claimDispatch).toHaveBeenCalledWith({ id: "intent-1", mobileKey: "protected" }, "09123456789", OtpPurpose.ADMIN_LOGIN, "hashed-otp");
    expect(mocks.claimDispatch.mock.invocationCallOrder[0]).toBeLessThan(mocks.sendSms.mock.invocationCallOrder[0]);
  });

  it("rejects OTP requests made too soon for the same mobile and purpose", async () => {
    mocks.reserveRequest.mockResolvedValue(null);

    await expect(
      requestOtp({ mobile: "09123456789", mode: "admin" }),
    ).rejects.toMatchObject({ status: 429 });
    expect(mocks.db.otpCode.create).not.toHaveBeenCalled();
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

  it("rejects OTP requests after five requests in an hour for the same mobile and purpose", async () => {
    mocks.reserveRequest.mockResolvedValue(null);

    await expect(
      requestOtp({ mobile: "09123456789", mode: "admin" }),
    ).rejects.toMatchObject({ status: 429 });
    expect(mocks.db.otpCode.create).not.toHaveBeenCalled();
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

  it("conceals admin OTP requests for mobiles outside the active admin list", async () => {
    mocks.db.admin.findUnique.mockResolvedValue(null);

    await expect(
      requestOtp({ mobile: "09123456789", mode: "admin" }),
    ).resolves.toEqual({ next: "otp", warning: ADMIN_REQUEST_MESSAGE });
    expect(mocks.db.otpCode.create).not.toHaveBeenCalled();
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

  it("conceals admin OTP requests for inactive admin mobiles", async () => {
    mocks.db.admin.findUnique.mockResolvedValue({
      id: "admin-1",
      active: false,
      role: UserRole.ENTRY_VIEWER,
    });

    await expect(
      requestOtp({ mobile: "09123456789", mode: "admin" }),
    ).resolves.toEqual({ next: "otp", warning: ADMIN_REQUEST_MESSAGE });
    expect(mocks.db.otpCode.create).not.toHaveBeenCalled();
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

  it("allows active entry viewer admins to request an admin OTP", async () => {
    mocks.db.admin.findUnique.mockResolvedValue({
      id: "admin-1",
      active: true,
      role: UserRole.ENTRY_VIEWER,
    });

    await expect(requestOtp({ mobile: "09362116801", mode: "admin" })).resolves.toEqual({
      next: "otp", warning: ADMIN_REQUEST_MESSAGE,
    });
    expect(mocks.claimDispatch).toHaveBeenCalledOnce();
    expect(mocks.sendSms).toHaveBeenCalledOnce();
  });

  it("does not reveal whether a user mobile is already registered when requesting an OTP", async () => {
    await expect(
      requestOtp({ mobile: "09123456789", mode: "user" }),
    ).resolves.toEqual({ next: "otp" });
    expect(mocks.db.user.findUnique).not.toHaveBeenCalled();
  });

  it("issues a cookie only for the transaction winner", async () => {
    await expect(verifyOtp({ mobile: "09123456789", code: "123456", mode: "user" }))
      .resolves.toEqual({ redirectTo: "/dashboard" });
    expect(mocks.consume).toHaveBeenCalledWith("otp-1", "09123456789", OtpPurpose.USER_LOGIN);
    expect(mocks.createSession).toHaveBeenCalledWith({ subjectId: "user-1", kind: "user" });
  });

  it("passes qualified address to shared accounting", async () => {
    await requestOtp({ mobile: "09123456789", mode: "user" }, { clientIp: "203.0.113.5" });
    expect(mocks.reserveRequest).toHaveBeenCalledWith("09123456789", OtpPurpose.USER_LOGIN, "203.0.113.5");
  });
  it("keeps code entry available on uncertain delivery without retrying SMS", async () => {
    mocks.sendSms.mockRejectedValueOnce(new Error("sensitive provider payload"));
    expect(await requestOtp({ mobile: "09123456789", mode: "user" })).toMatchObject({ next: "otp", warning: expect.any(String) });
    expect(mocks.sendSms).toHaveBeenCalledOnce();
  });
  it("does not dispatch after claim failure", async () => {
    mocks.claimDispatch.mockRejectedValueOnce(new Error("lost commit"));
    await expect(requestOtp({ mobile: "09123456789", mode: "user" })).rejects.toMatchObject({ status: 503 });
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

  it("applies rate limits before revealing whether an admin mobile exists", async () => {
    mocks.db.admin.findUnique.mockResolvedValue(null);
    mocks.reserveRequest.mockResolvedValue(null);

    await expect(
      requestOtp({ mobile: "09123456789", mode: "admin" }),
    ).rejects.toMatchObject({ status: 429 });
    expect(mocks.db.admin.findUnique).not.toHaveBeenCalled();
  });

  it("reserves before comparison and does not refund a wrong guess", async () => {
    mocks.bcryptCompare.mockResolvedValue(false);
    await expect(verifyOtp({ mobile: "09123456789", code: "000000", mode: "user" })).rejects.toMatchObject({ status: 400 });
    expect(mocks.reserveGuess.mock.invocationCallOrder[0]).toBeLessThan(mocks.bcryptCompare.mock.invocationCallOrder[0]);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("bounds dummy comparisons using shared reservations", async () => {
    mocks.reserveGuess.mockResolvedValue(null);
    await expect(verifyOtp({ mobile: "09123456789", code: "123456", mode: "user" })).rejects.toMatchObject({ status: 400 });
    expect(mocks.bcryptCompare).toHaveBeenCalledOnce();
    mocks.bcryptCompare.mockClear(); mocks.reserveBudget.mockResolvedValue(false);
    await expect(verifyOtp({ mobile: "09123456789", code: "123456", mode: "user" })).rejects.toMatchObject({ status: 429 });
    expect(mocks.bcryptCompare).not.toHaveBeenCalled();
  });

  it("fails closed before comparison on database failure", async () => {
    mocks.reserveGuess.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(verifyOtp({ mobile: "09123456789", code: "123456", mode: "user" })).rejects.toMatchObject({ status: 503 });
    expect(mocks.bcryptCompare).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("does not issue a session when live consume rejects", async () => {
    mocks.consume.mockResolvedValue(null);
    await expect(verifyOtp({ mobile: "09123456789", code: "123456", mode: "user" })).rejects.toMatchObject({ status: 400 });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
  it.each(["sms", "lookup", "claim", "false-claim"])("uniform admin response on %s uncertainty, with padding and no replay", async failure => {
    if (failure === "sms") mocks.sendSms.mockRejectedValueOnce(new Error("private"));
    if (failure === "lookup") mocks.db.admin.findUnique.mockRejectedValueOnce(new Error("private"));
    if (failure === "claim") mocks.claimDispatch.mockRejectedValueOnce(new Error("private"));
    if (failure === "false-claim") mocks.claimDispatch.mockResolvedValueOnce(false);
    await expect(requestOtp({mobile:"09123456789",mode:"admin"})).resolves.toEqual({next:"otp",warning:ADMIN_REQUEST_MESSAGE});
    expect(mocks.waitResponse).toHaveBeenCalledOnce();
    expect(mocks.sendSms).toHaveBeenCalledTimes(failure === "sms" ? 1 : 0);
    expect(mocks.db.user.create).not.toHaveBeenCalled();
  });

});
