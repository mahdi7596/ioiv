-- Existing Prisma payment action values were never added to the SQL enum.
ALTER TYPE "FacilitiesAuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_REDIRECT_READY';
ALTER TYPE "FacilitiesAuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_CANCELLED';
ALTER TYPE "FacilitiesAuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_TIMED_OUT';
