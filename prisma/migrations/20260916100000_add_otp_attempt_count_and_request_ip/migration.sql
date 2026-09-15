-- OTP brute-force protection: count wrong verifications per code and record the
-- requesting client address for a per-IP request cap. Both columns are additive.
ALTER TABLE "OtpCode" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OtpCode" ADD COLUMN "requestIp" TEXT;

CREATE INDEX "OtpCode_requestIp_createdAt_idx" ON "OtpCode"("requestIp", "createdAt");
