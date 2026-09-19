import { createHmac, randomUUID } from "node:crypto";
import { OtpPurpose } from "@prisma/client";
import { db } from "@/lib/db";
import { spend } from "./verification";

export const REQUEST_LIMIT_MESSAGE = "تعداد درخواست‌های کد بیش از حد مجاز است. برای ارسال مجدد ۹۰ ثانیه صبر کنید؛ اگر محدودیت ادامه داشت، یک ساعت دیگر تلاش کنید";
export const REQUEST_UNAVAILABLE_MESSAGE = "ارسال کد تأیید نشد. اگر پیامک رسید از همان کد استفاده کنید؛ در غیر این صورت پس از ۹۰ ثانیه دوباره تلاش کنید";
const LOCK = 730180804;
function config() {
  const secret = process.env.OTP_VERIFY_LIMIT_SECRET;
  const limit = Number(process.env.OTP_MAX_REQUESTS_PER_IP_PER_WINDOW ?? 30);
  if (!secret || secret.length < 32 || !Number.isInteger(limit) || limit < 1 || limit > 3000) throw new Error("OTP request configuration unavailable");
  const hash = (value: string) => createHmac("sha256", secret).update(value).digest("hex");
  return { limit, hash, tag: hash("verification-config-v1") };
}

export async function reserveOtpRequest(mobile: string, purpose: OtpPurpose, address: string | null) {
  const { limit, hash, tag } = config();
  return db.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK})`;
    await tx.$queryRaw`SELECT public.prune_auth_verify_buckets()`;
    await tx.$queryRaw`SELECT public.prune_auth_request_intents()`;
    const [{ at, epoch }] = await tx.$queryRaw<Array<{ at: Date; epoch: number }>>`
      SELECT at, floor(extract(epoch FROM at)/3600)::integer AS epoch
      FROM (SELECT clock_timestamp() AS at) admission_clock`;
    // Both namespaces must agree with already-running workers' secret.
    const tags = await tx.$queryRaw<Array<{ secretTag: string | null }>>`
      SELECT "secretTag" FROM "AuthVerifyBucket" WHERE "key" IN ('global', 'request:global')`;
    if (tags.some(row => row.secretTag !== tag)) throw new Error("OTP request configuration mismatch");
    if (!await spend(tx, "request:global", 3000, tag, at)) return null;
    const addressKey = (e: number) => `request:address:${address ? hash(`address:${e}:${address}`) : "unknown"}`;
    if (!await spend(tx, addressKey(epoch), limit, null, at, address ? addressKey(epoch-1) : undefined)) return null;
    const mobileKey = (e: number) => `request:mobile:${hash(`mobile:${e}:${purpose}:${mobile}`)}`;
    const key = mobileKey(epoch), previousKey = mobileKey(epoch-1);
    const cooldown = await tx.$queryRaw<Array<{ blocked: boolean }>>`
      SELECT EXISTS(SELECT 1 FROM "AuthVerifyBucket", unnest("attempts") t
        WHERE "key" IN (${key}, ${previousKey}) AND t > ${at}::timestamptz - interval '90 seconds') AS blocked`;
    if (cooldown[0].blocked || !await spend(tx, key, 5, null, at, previousKey)) return null;
    const id = randomUUID();
    await tx.$executeRaw`INSERT INTO "AuthRequestIntent" ("id", "mobileKey", "createdAt") VALUES (${id}, ${key}, ${at})`;
    return { id, mobileKey: key };
  }, { maxWait: 3000, timeout: 5000 });
}

// No provider I/O in the transaction. Only the caller observing this commit may
// dispatch, once. A lost acknowledgement deliberately spends quota without retry.
export async function claimOtpDispatch(intent: { id: string; mobileKey: string }, mobile: string, purpose: OtpPurpose, codeHash: string) {
  const { hash, tag } = config();
  return db.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK})`;
    await tx.$queryRaw`SELECT public.prune_auth_verify_buckets()`;
    await tx.$queryRaw`SELECT public.prune_auth_request_intents()`;
    const tags = await tx.$queryRaw<Array<{ secretTag: string | null }>>`
      SELECT "secretTag" FROM "AuthVerifyBucket" WHERE "key" IN ('global', 'request:global')`;
    if (!tags.length || tags.some(row => row.secretTag !== tag)) throw new Error("OTP request configuration mismatch");
    const rows = await tx.$queryRaw<Array<{ id: string; createdAt: Date }>>`
      SELECT "id", "createdAt" FROM "AuthRequestIntent" WHERE "id" = ${intent.id}
        AND "mobileKey" = ${intent.mobileKey} AND "claimedAt" IS NULL
        AND "createdAt" > clock_timestamp() - interval '90 seconds' FOR UPDATE`;
    if (!rows.length) return false;
    const epoch = Math.floor(rows[0].createdAt.getTime()/3600000);
    if (intent.mobileKey !== `request:mobile:${hash(`mobile:${epoch}:${purpose}:${mobile}`)}`) return false;
    // Lock existing OTPs before fresh expiry/claim time; never resurrect stale work
    // that waited behind a verification transaction.
    await tx.$queryRaw`SELECT "id" FROM "OtpCode" WHERE "mobile"=${mobile} AND "purpose"=${purpose}::"OtpPurpose" FOR UPDATE`;
    const claimed = await tx.$queryRaw<Array<{ at: Date }>>`
      UPDATE "AuthRequestIntent" SET "claimedAt"=clock_timestamp()
      WHERE "id"=${intent.id} AND "claimedAt" IS NULL AND "createdAt">clock_timestamp()-interval '90 seconds'
      RETURNING "claimedAt" AS at`;
    if (!claimed.length) return false;
    const at = claimed[0].at;
    await tx.otpCode.updateMany({ where: { mobile, purpose, consumedAt: null }, data: { consumedAt: at } });
    await tx.otpCode.create({ data: { id: intent.id, mobile, purpose, codeHash, createdAt: at, expiresAt: new Date(at.getTime()+120000) } });
    return true;
  }, { maxWait: 3000, timeout: 5000 });
}
