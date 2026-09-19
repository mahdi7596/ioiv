import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { OtpPurpose, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const VERIFY_LIMIT_MESSAGE = "تعداد تلاش‌های ورود بیش از حد مجاز است. لطفاً یک ساعت دیگر دوباره تلاش کنید";
export const VERIFY_UNAVAILABLE_MESSAGE = "ورود موقتاً در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید";
const LOCK = 730180804;

// Only a deployment-qualified proxy that replaces X-Real-IP may supply identity.
export function verificationClientIp(headers: Headers): string | null {
  if (process.env.OTP_VERIFY_TRUST_PROXY !== "true") return null;
  const value = headers.get("x-real-ip")?.trim();
  if (!value || !isIP(value)) return null;
  // URL serialization canonicalizes equivalent IPv6 forms.
  return isIP(value) === 6 ? new URL(`http://[${value}]/`).hostname.slice(1, -1) : value;
}

function identityKeys(mobile: string, purpose: OtpPurpose, address: string | null, epoch: number) {
  const secret = process.env.OTP_VERIFY_LIMIT_SECRET;
  if (!secret || secret.length < 32) throw new Error("OTP verification configuration unavailable");
  const hash = (value: string) => createHmac("sha256", secret).update(value).digest("hex");
  return { tag: hash("verification-config-v1"), mobile: hash(`mobile:${epoch}:${purpose}:${mobile}`), previousMobile: hash(`mobile:${epoch-1}:${purpose}:${mobile}`),
    address: address ? hash(`address:${epoch}:${address}`) : "unknown",
    previousAddress: address ? hash(`address:${epoch-1}:${address}`) : null };
}

export async function spend(tx: Prisma.TransactionClient, key: string, limit: number, tag: string | null, at: Date, previousKey?: string) {
  // Read previous hourly pseudonym too: rotating identifiers must not reset budgets.
  let remaining = limit;
  if (previousKey) {
    const previous = await tx.$queryRaw<Array<{ count: number }>>`
      SELECT cardinality(ARRAY(SELECT t FROM unnest("attempts") t
        WHERE t > ${at}::timestamptz - interval '1 hour')) AS count
      FROM "AuthVerifyBucket" WHERE "key" = ${previousKey}`;
    remaining -= previous[0]?.count ?? 0;
    if (remaining <= 0) return false;
  }
  const rows = await tx.$queryRaw<Array<{ key: string }>>`
    INSERT INTO "AuthVerifyBucket" ("key", "secretTag", "attempts", "touchedAt")
    VALUES (${key}, ${tag}, ARRAY[${at}::timestamptz], ${at}::timestamptz)
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = ARRAY(SELECT t FROM unnest("AuthVerifyBucket"."attempts") t
        WHERE t > ${at}::timestamptz - interval '1 hour') || ${at}::timestamptz,
      "touchedAt" = ${at}::timestamptz
    WHERE cardinality(ARRAY(SELECT t FROM unnest("AuthVerifyBucket"."attempts") t
        WHERE t > ${at}::timestamptz - interval '1 hour')) < ${remaining}
    RETURNING "key"`;
  return rows.length === 1;
}

// Commit denied mobile probes' address/global reservations too. No retry after an
// ambiguous commit; spending capacity without a comparison is deliberately safe.
export async function reserveVerificationBudget(mobile: string, purpose: OtpPurpose, address: string | null) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK})`;
    await tx.$queryRaw`SELECT public.prune_auth_verify_buckets()`;
    // One admission instant drives epoch, stored events and cutoff. A transaction
    // crossing HH:00 must not put new-hour timestamps in an old-hour pseudonym.
    const [{ epoch, at }] = await tx.$queryRaw<Array<{ epoch: number; at: Date }>>`
      SELECT at, floor(extract(epoch FROM at) / 3600)::integer AS epoch
      FROM (SELECT clock_timestamp() AS at) admission_clock`;
    const keys = identityKeys(mobile, purpose, address, epoch);
    const existing = await tx.$queryRaw<Array<{ secretTag: string | null }>>`
      SELECT "secretTag" FROM "AuthVerifyBucket" WHERE "key" IN ('global', 'request:global')`;
    if (existing.some(row => row.secretTag !== keys.tag)) throw new Error("OTP verification configuration mismatch");
    if (!await spend(tx, "global", 3000, keys.tag, at)) return false;
    if (!await spend(tx, `address:${keys.address}`, address ? 120 : 300, null, at, keys.previousAddress ? `address:${keys.previousAddress}` : undefined)) return false;
    return spend(tx, `mobile:${keys.mobile}`, 30, null, at, `mobile:${keys.previousMobile}`);
  }, { maxWait: 3000, timeout: 5000 });
}

export async function reserveOtpGuess(mobile: string, purpose: OtpPurpose) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
    const candidates = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "OtpCode" WHERE "mobile" = ${mobile}
        AND "purpose" = ${purpose}::"OtpPurpose"
        ORDER BY "createdAt" DESC, "id" DESC LIMIT 1 FOR UPDATE`;
    if (!candidates[0]) return null;
    const rows = await tx.$queryRaw<Array<{ id: string; codeHash: string }>>`
      UPDATE "OtpCode" SET "attemptCount" = "attemptCount" + 1
      WHERE "id" = ${candidates[0].id} AND "attemptCount" < 5
        AND "consumedAt" IS NULL AND "expiresAt" > clock_timestamp()
      RETURNING "id", "codeHash"`;
    return rows[0] ?? null;
  }, { maxWait: 3000, timeout: 5000 });
}

export async function consumeOtpForSession(id: string, mobile: string, purpose: OtpPurpose) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
    await tx.$queryRaw`SELECT "id" FROM "OtpCode" WHERE "id" = ${id} FOR UPDATE`;
    let subjectId: string;
    const kind = purpose === OtpPurpose.ADMIN_LOGIN ? "admin" : "user";
    if (kind === "admin") {
      const admins = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT public.lock_active_otp_admin(${mobile}) AS "id"`;
      if (!admins[0]?.id) return null;
      subjectId = admins[0].id;
    } else {
      // Concurrent codes for the same user cannot produce a unique-key failure.
      await tx.$executeRaw`INSERT INTO "User" ("id", "mobile", "updatedAt")
        VALUES (${randomUUID()}, ${mobile}, clock_timestamp()) ON CONFLICT ("mobile") DO NOTHING`;
      subjectId = (await tx.user.findUniqueOrThrow({ where: { mobile }, select: { id: true } })).id;
    }
    // Last data operation: fresh clock after locks/user lookup, never request-start time.
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE "OtpCode" SET "consumedAt" = clock_timestamp()
      WHERE "id" = ${id} AND "mobile" = ${mobile} AND "purpose" = ${purpose}::"OtpPurpose"
        AND "consumedAt" IS NULL AND "expiresAt" > clock_timestamp()
        AND "attemptCount" BETWEEN 1 AND 5 RETURNING "id"`;
    if (!rows.length) throw new OtpConsumeRejected(); // rollback new user as well
    return { subjectId, kind } as const;
  }, { maxWait: 3000, timeout: 5000 });
}
export class OtpConsumeRejected extends Error {}
