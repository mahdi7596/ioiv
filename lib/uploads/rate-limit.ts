/**
 * Process-local upload admission control. Two independent bounds:
 *
 * - In-flight: how many upload bodies may be buffered at once, per user and in
 *   total. This is the memory bound: a request holds roughly two copies of the
 *   file (the multipart body and the Buffer handed to the verifier and scanner)
 *   for its whole lifetime, so the global cap times the file limit must stay
 *   well under the container's memory limit.
 * - Hourly: a sliding window per user and per client IP, so a single account
 *   (or one address cycling accounts, which OTP self-registration allows) cannot
 *   keep the scanner and disk busy indefinitely.
 *
 * State lives in this module because one Node process serves the container;
 * it resets on restart, which is acceptable for an abuse bound (the durable
 * quota is the database trigger). Limits come from the environment so an
 * operator can tune them without a deploy.
 */
export type UploadAdmission =
  | { ok: true; release: () => void }
  | { ok: false; reason: "USER_IN_FLIGHT" | "GLOBAL_IN_FLIGHT" | "USER_HOURLY" | "IP_HOURLY" };

export type UploadLimits = {
  maxInFlightPerUser: number;
  maxInFlightGlobal: number;
  maxPerUserPerHour: number;
  maxPerIpPerHour: number;
};

const HOUR_MS = 60 * 60 * 1000;
const SWEEP_EVERY = 1_000;

const DEFAULT_LIMITS: UploadLimits = {
  maxInFlightPerUser: 2,
  maxInFlightGlobal: 6,
  maxPerUserPerHour: 60,
  maxPerIpPerHour: 120,
};

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function uploadLimitsFromEnv(env: Partial<NodeJS.ProcessEnv> = process.env): UploadLimits {
  return {
    maxInFlightPerUser: positiveInteger(env.UPLOAD_MAX_IN_FLIGHT_PER_USER, DEFAULT_LIMITS.maxInFlightPerUser),
    maxInFlightGlobal: positiveInteger(env.UPLOAD_MAX_IN_FLIGHT_GLOBAL, DEFAULT_LIMITS.maxInFlightGlobal),
    maxPerUserPerHour: positiveInteger(env.UPLOAD_MAX_PER_USER_PER_HOUR, DEFAULT_LIMITS.maxPerUserPerHour),
    maxPerIpPerHour: positiveInteger(env.UPLOAD_MAX_PER_IP_PER_HOUR, DEFAULT_LIMITS.maxPerIpPerHour),
  };
}

export class UploadRateLimiter {
  private readonly inFlightByUser = new Map<string, number>();
  private readonly userWindows = new Map<string, number[]>();
  private readonly ipWindows = new Map<string, number[]>();
  private inFlightTotal = 0;
  private admissions = 0;

  constructor(private readonly limits: UploadLimits = DEFAULT_LIMITS) {}

  /**
   * Call before reading the request body; release in a `finally` once the
   * response is ready. A denied admission holds nothing.
   */
  admit(input: { subjectId: string; clientIp: string | null; now?: number }): UploadAdmission {
    const now = input.now ?? Date.now();
    this.admissions += 1;
    if (this.admissions % SWEEP_EVERY === 0) this.sweep(now);

    if (this.inFlightTotal >= this.limits.maxInFlightGlobal) return { ok: false, reason: "GLOBAL_IN_FLIGHT" };
    const userInFlight = this.inFlightByUser.get(input.subjectId) ?? 0;
    if (userInFlight >= this.limits.maxInFlightPerUser) return { ok: false, reason: "USER_IN_FLIGHT" };

    const userWindow = prune(this.userWindows, input.subjectId, now);
    if (userWindow.length >= this.limits.maxPerUserPerHour) return { ok: false, reason: "USER_HOURLY" };
    const ipWindow = input.clientIp ? prune(this.ipWindows, input.clientIp, now) : null;
    if (ipWindow && ipWindow.length >= this.limits.maxPerIpPerHour) return { ok: false, reason: "IP_HOURLY" };

    userWindow.push(now);
    ipWindow?.push(now);
    this.inFlightByUser.set(input.subjectId, userInFlight + 1);
    this.inFlightTotal += 1;

    let released = false;
    return {
      ok: true,
      release: () => {
        if (released) return;
        released = true;
        const remaining = (this.inFlightByUser.get(input.subjectId) ?? 1) - 1;
        if (remaining <= 0) this.inFlightByUser.delete(input.subjectId);
        else this.inFlightByUser.set(input.subjectId, remaining);
        this.inFlightTotal = Math.max(0, this.inFlightTotal - 1);
      },
    };
  }

  private sweep(now: number) {
    for (const windows of [this.userWindows, this.ipWindows]) {
      for (const key of windows.keys()) {
        if (prune(windows, key, now).length === 0) windows.delete(key);
      }
    }
  }
}

function prune(windows: Map<string, number[]>, key: string, now: number) {
  const cutoff = now - HOUR_MS;
  let window = windows.get(key);
  if (!window) {
    window = [];
    windows.set(key, window);
    return window;
  }
  let drop = 0;
  while (drop < window.length && window[drop] <= cutoff) drop += 1;
  if (drop > 0) window.splice(0, drop);
  return window;
}

export const UPLOAD_RATE_LIMIT_MESSAGES: Record<Extract<UploadAdmission, { ok: false }>["reason"], string> = {
  USER_IN_FLIGHT: "بارگذاری دیگری از حساب شما در حال انجام است؛ پس از پایان آن دوباره تلاش کنید.",
  GLOBAL_IN_FLIGHT: "سامانه در حال پردازش بارگذاری‌های دیگر است؛ چند لحظه بعد دوباره تلاش کنید.",
  USER_HOURLY: "تعداد بارگذاری‌های شما در یک ساعت گذشته بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید.",
  IP_HOURLY: "تعداد بارگذاری‌ها از این آدرس بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید.",
};

// One limiter per process: the module is evaluated once, route modules share it.
export const uploadRateLimiter = new UploadRateLimiter(uploadLimitsFromEnv());
