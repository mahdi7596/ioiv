import { OtpPurpose, UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestOtp, verifyOtp } from "@/lib/actions/auth";

const mocks = vi.hoisted(() => ({
  db: {
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
  bcryptCompare: vi.fn(),
  createSession: vi.fn(),
  sendSms: vi.fn(),
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
    mocks.bcryptCompare.mockResolvedValue(true);
    mocks.createSession.mockResolvedValue(undefined);
    mocks.sendSms.mockResolvedValue({ ok: true });
  });

  it("invalidates older unused OTPs before creating a replacement", async () => {
    await requestOtp({ mobile: "09123456789", mode: "admin" });

    expect(mocks.db.otpCode.updateMany).toHaveBeenCalledWith({
      where: {
        mobile: "09123456789",
        purpose: OtpPurpose.ADMIN_LOGIN,
        consumedAt: null,
      },
      data: {
        consumedAt: new Date("2026-04-29T10:00:00.000Z"),
      },
    });
    expect(mocks.db.otpCode.create).toHaveBeenCalledOnce();
  });

  it("rejects OTP requests made too soon for the same mobile and purpose", async () => {
    mocks.db.otpCode.findFirst.mockResolvedValue({
      createdAt: new Date("2026-04-29T09:59:30.000Z"),
    });

    await expect(
      requestOtp({ mobile: "09123456789", mode: "admin" }),
    ).rejects.toMatchObject({ status: 429 });
    expect(mocks.db.otpCode.create).not.toHaveBeenCalled();
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

  it("rejects OTP requests after five requests in an hour for the same mobile and purpose", async () => {
    mocks.db.otpCode.findFirst.mockResolvedValue({
      createdAt: new Date("2026-04-29T09:55:00.000Z"),
    });
    mocks.db.otpCode.count.mockResolvedValue(5);

    await expect(
      requestOtp({ mobile: "09123456789", mode: "admin" }),
    ).rejects.toMatchObject({ status: 429 });
    expect(mocks.db.otpCode.create).not.toHaveBeenCalled();
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

  it("rejects admin OTP requests for mobiles outside the active admin list", async () => {
    mocks.db.admin.findUnique.mockResolvedValue(null);

    await expect(
      requestOtp({ mobile: "09123456789", mode: "admin" }),
    ).rejects.toMatchObject({
      status: 403,
      message: "دسترسی مدیریت برای این شماره فعال نیست",
    });
    expect(mocks.db.otpCode.create).not.toHaveBeenCalled();
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

  it("rejects admin OTP requests for inactive admin mobiles", async () => {
    mocks.db.admin.findUnique.mockResolvedValue({
      id: "admin-1",
      active: false,
      role: UserRole.ENTRY_VIEWER,
    });

    await expect(
      requestOtp({ mobile: "09123456789", mode: "admin" }),
    ).rejects.toMatchObject({
      status: 403,
      message: "دسترسی مدیریت برای این شماره فعال نیست",
    });
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
      next: "otp",
    });
    expect(mocks.db.otpCode.create).toHaveBeenCalledOnce();
    expect(mocks.sendSms).toHaveBeenCalledOnce();
  });

  it("does not reveal whether a user mobile is already registered when requesting an OTP", async () => {
    await expect(
      requestOtp({ mobile: "09123456789", mode: "user" }),
    ).resolves.toEqual({ next: "otp" });
    expect(mocks.db.user.findUnique).not.toHaveBeenCalled();
  });

  it("creates a bare user with just their mobile number on first OTP verification", async () => {
    mocks.db.otpCode.findFirst.mockResolvedValue({
      id: "otp-1",
      codeHash: "hashed-otp",
    });

    await expect(
      verifyOtp({
        mobile: "09123456789",
        code: "123456",
        mode: "user",
      }),
    ).resolves.toEqual({ redirectTo: "/dashboard" });

    expect(mocks.db.user.create).toHaveBeenCalledWith({
      data: { mobile: "09123456789" },
    });
  });

  it("logs an existing user in without creating a new record", async () => {
    mocks.db.otpCode.findFirst.mockResolvedValue({
      id: "otp-1",
      codeHash: "hashed-otp",
    });
    mocks.db.user.findUnique.mockResolvedValueOnce({ id: "user-1", mobile: "09123456789" });

    await expect(
      verifyOtp({
        mobile: "09123456789",
        code: "123456",
        mode: "user",
      }),
    ).resolves.toEqual({ redirectTo: "/dashboard" });

    expect(mocks.db.user.create).not.toHaveBeenCalled();
    expect(mocks.createSession).toHaveBeenCalledWith({ subjectId: "user-1", kind: "user" });
  });

  it("records the requesting address and rejects an address over the hourly cap", async () => {
    await requestOtp({ mobile: "09123456789", mode: "user" }, { clientIp: "203.0.113.5" });
    expect(mocks.db.otpCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ requestIp: "203.0.113.5" }),
    });

    vi.clearAllMocks();
    mocks.db.otpCode.findFirst.mockResolvedValue(null);
    // First count is the per-mobile window, second is the per-address window.
    mocks.db.otpCode.count.mockResolvedValueOnce(0).mockResolvedValueOnce(30);

    await expect(
      requestOtp({ mobile: "09120000001", mode: "user" }, { clientIp: "203.0.113.5" }),
    ).rejects.toMatchObject({ status: 429 });
    expect(mocks.db.otpCode.create).not.toHaveBeenCalled();
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

  it("applies rate limits before revealing whether an admin mobile exists", async () => {
    mocks.db.admin.findUnique.mockResolvedValue(null);
    mocks.db.otpCode.count.mockResolvedValue(5);

    await expect(
      requestOtp({ mobile: "09123456789", mode: "admin" }),
    ).rejects.toMatchObject({ status: 429 });
    expect(mocks.db.admin.findUnique).not.toHaveBeenCalled();
  });

  it("only selects codes that still have verification attempts left", async () => {
    mocks.db.otpCode.findFirst.mockResolvedValue({ id: "otp-1", codeHash: "hashed-otp", attemptCount: 0 });

    await verifyOtp({ mobile: "09123456789", code: "123456", mode: "user" });

    expect(mocks.db.otpCode.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ attemptCount: { lt: 5 } }) }),
    );
  });

  it("counts a wrong code against the OTP and does not create a session", async () => {
    mocks.db.otpCode.findFirst.mockResolvedValue({ id: "otp-1", codeHash: "hashed-otp", attemptCount: 2 });
    mocks.bcryptCompare.mockResolvedValue(false);

    await expect(
      verifyOtp({ mobile: "09123456789", code: "000000", mode: "user" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.db.otpCode.updateMany).toHaveBeenCalledWith({
      where: { id: "otp-1", consumedAt: null },
      data: { attemptCount: { increment: 1 } },
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.db.user.create).not.toHaveBeenCalled();
  });

  it("does not mint a session when the code was consumed concurrently", async () => {
    mocks.db.otpCode.findFirst.mockResolvedValue({ id: "otp-1", codeHash: "hashed-otp", attemptCount: 0 });
    mocks.db.otpCode.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      verifyOtp({ mobile: "09123456789", code: "123456", mode: "user" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.db.otpCode.updateMany).toHaveBeenCalledWith({
      where: { id: "otp-1", consumedAt: null },
      data: { consumedAt: new Date("2026-04-29T10:00:00.000Z") },
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.db.user.create).not.toHaveBeenCalled();
  });

  it("runs a dummy hash comparison when no usable code exists", async () => {
    mocks.db.otpCode.findFirst.mockResolvedValue(null);

    await expect(
      verifyOtp({ mobile: "09123456789", code: "123456", mode: "user" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.bcryptCompare).toHaveBeenCalledOnce();
    expect(mocks.db.otpCode.updateMany).not.toHaveBeenCalled();
  });
});
