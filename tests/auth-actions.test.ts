import { OtpPurpose } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionError, requestOtp, verifyOtp } from "@/lib/actions/auth";

const mocks = vi.hoisted(() => ({
  db: {
    admin: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
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
    });
    mocks.db.user.findUnique.mockResolvedValue(null);
    mocks.db.user.create.mockResolvedValue({ id: "user-1" });
    mocks.db.otpCode.findFirst.mockResolvedValue(null);
    mocks.db.otpCode.count.mockResolvedValue(0);
    mocks.db.otpCode.updateMany.mockResolvedValue({ count: 0 });
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
    ).rejects.toMatchObject<ActionError>({ status: 429 });
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
    ).rejects.toMatchObject<ActionError>({ status: 429 });
    expect(mocks.db.otpCode.create).not.toHaveBeenCalled();
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

  it("does not reveal whether an admin mobile exists when requesting an OTP", async () => {
    mocks.db.admin.findUnique.mockResolvedValue(null);

    await expect(
      requestOtp({ mobile: "09123456789", mode: "admin" }),
    ).resolves.toEqual({ next: "otp" });
    expect(mocks.db.otpCode.create).not.toHaveBeenCalled();
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

  it("does not reveal whether a user mobile is already registered when requesting an OTP", async () => {
    await expect(
      requestOtp({ mobile: "09123456789", mode: "user" }),
    ).resolves.toEqual({ next: "otp" });
    expect(mocks.db.user.findUnique).not.toHaveBeenCalled();
  });

  it("stores required registration fields when creating a user after OTP verification", async () => {
    mocks.db.otpCode.findFirst.mockResolvedValue({
      id: "otp-1",
      codeHash: "hashed-otp",
    });

    await expect(
      verifyOtp({
        mobile: "09123456789",
        code: "1234",
        mode: "user",
        companyName: "شرکت نمونه",
        companyNationalId: "12345678901",
        companyContactNationalId: "10987654321",
        companyContactFullName: "علی رضایی",
        companyContactNationalCode: "0012345678",
      }),
    ).resolves.toEqual({ redirectTo: "/dashboard" });

    expect(mocks.db.user.create).toHaveBeenCalledWith({
      data: {
        mobile: "09123456789",
        companyName: "شرکت نمونه",
        companyNationalId: "12345678901",
        companyContactNationalId: "10987654321",
        companyContactFullName: "علی رضایی",
        companyContactNationalCode: "0012345678",
      },
    });
  });
});
