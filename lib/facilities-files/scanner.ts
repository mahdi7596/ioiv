import net from "node:net";
import { logger } from "@/lib/logger";

import type { FacilitiesStorageKey } from "@/lib/facilities-files/storage";
import { MAX_FACILITIES_FILE_BYTES, type FacilitiesStoredFileType } from "@/lib/facilities-files/verification";

export type FacilitiesScanStatus = "PASSED" | "FAILED" | "UNAVAILABLE";

export type FacilitiesScanRequest = {
  storageKey: FacilitiesStorageKey;
  byteSize: number;
  sha256: string;
  fileType: FacilitiesStoredFileType;
  bytes: Buffer;
};

export type FacilitiesScanResult = {
  status: FacilitiesScanStatus;
  // This is a fixed safe diagnostic category, never scanner output or document data.
  reason?: "MALWARE_DETECTED" | "SCANNER_UNAVAILABLE" | "SCANNING_DISABLED";
};

export interface FacilitiesFileScanner {
  scan(request: FacilitiesScanRequest): Promise<FacilitiesScanResult>;
}

export class UnavailableFacilitiesFileScanner implements FacilitiesFileScanner {
  async scan(): Promise<FacilitiesScanResult> {
    return { status: "UNAVAILABLE", reason: "SCANNER_UNAVAILABLE" };
  }
}

/**
 * Development-only scanner that reports every file as clean. It exists solely so
 * local work is not blocked when no clamd is provisioned. `createFacilitiesScannerFromEnv`
 * only ever selects it outside production and behind an explicit opt-in flag, so a
 * this development flag cannot bypass production scanning.
 */
export class PassthroughFacilitiesFileScanner implements FacilitiesFileScanner {
  async scan(): Promise<FacilitiesScanResult> {
    return { status: "PASSED" };
  }
}

/** Owner-authorized policy bypass. PASSED means admitted, not malware-scanned. */
class DisabledAntivirusScanner implements FacilitiesFileScanner {
  async scan(): Promise<FacilitiesScanResult> {
    logger.warn("upload_antivirus_disabled", { reason: "SCANNING_DISABLED" });
    return { status: "PASSED", reason: "SCANNING_DISABLED" };
  }
}

export function isUploadAntivirusDisabled(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  return env.UPLOAD_ANTIVIRUS_DISABLED === "true";
}

export type ClamdInstreamScannerOptions = {
  host: string;
  port: number;
  timeoutMs?: number;
  chunkSize?: number;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_CHUNK_SIZE = 64 * 1024;
const MAX_CLAMD_CHUNK_SIZE = 1024 * 1024;

/**
 * A clamd INSTREAM client. INSTREAM avoids writing untrusted document content to a
 * scanner-visible path and frames a bounded Buffer in explicit chunks.
 */
export class ClamdInstreamFacilitiesFileScanner implements FacilitiesFileScanner {
  private readonly timeoutMs: number;
  private readonly chunkSize: number;

  constructor(private readonly options: ClamdInstreamScannerOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  }

  async scan(request: FacilitiesScanRequest): Promise<FacilitiesScanResult> {
    if (
      !Number.isInteger(request.byteSize) ||
      request.byteSize < 1 ||
      request.byteSize > MAX_FACILITIES_FILE_BYTES ||
      request.byteSize !== request.bytes.byteLength
    ) {
      return { status: "UNAVAILABLE", reason: "SCANNER_UNAVAILABLE" };
    }
    if (
      !Number.isInteger(this.options.port) ||
      this.options.port < 1 ||
      this.options.port > 65_535 ||
      this.timeoutMs < 1 ||
      this.chunkSize < 1 ||
      this.chunkSize > MAX_CLAMD_CHUNK_SIZE
    ) {
      return { status: "UNAVAILABLE", reason: "SCANNER_UNAVAILABLE" };
    }

    try {
      const response = await sendClamdInstreamRequest({
        host: this.options.host,
        port: this.options.port,
        timeoutMs: this.timeoutMs,
        chunkSize: this.chunkSize,
        bytes: request.bytes,
      });
      if (/\bOK\0?$/.test(response)) return { status: "PASSED" };
      if (/\bFOUND\0?$/.test(response)) return { status: "FAILED", reason: "MALWARE_DETECTED" };
      return { status: "UNAVAILABLE", reason: "SCANNER_UNAVAILABLE" };
    } catch {
      // A timeout, socket error, or malformed scanner interaction must never be
      // treated as a clean scan. The caller keeps the object quarantined.
      return { status: "UNAVAILABLE", reason: "SCANNER_UNAVAILABLE" };
    }
  }
}

export type Semaphore = {
  /** Resolves a release function, or null when the queue wait exceeded `timeoutMs`. */
  acquire(timeoutMs: number): Promise<(() => void) | null>;
};

export function createSemaphore(limit: number): Semaphore {
  let active = 0;
  const waiters: Array<() => void> = [];
  const release = () => {
    active -= 1;
    waiters.shift()?.();
  };
  return {
    acquire(timeoutMs) {
      if (active < limit) {
        active += 1;
        return Promise.resolve(release);
      }
      return new Promise((resolve) => {
        const grant = () => {
          clearTimeout(timer);
          active += 1;
          resolve(release);
        };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(grant);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, timeoutMs);
        waiters.push(grant);
      });
    },
  };
}

/**
 * Bounds how many scans run at once so a burst of uploads cannot exhaust clamd's
 * worker threads (default MaxThreads is about 10). A request that waits longer
 * than the queue timeout reports UNAVAILABLE, which the lifecycle already treats
 * as "retained, retry later".
 */
export function limitScannerConcurrency(scanner: FacilitiesFileScanner, semaphore: Semaphore, queueTimeoutMs: number): FacilitiesFileScanner {
  return {
    async scan(request) {
      const release = await semaphore.acquire(queueTimeoutMs);
      if (!release) return { status: "UNAVAILABLE", reason: "SCANNER_UNAVAILABLE" };
      try {
        return await scanner.scan(request);
      } finally {
        release();
      }
    },
  };
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// Process-wide: the factory is called per request, so the limiter must not live
// on the scanner instance. One Node process serves the container.
const DEFAULT_SCAN_CONCURRENCY = 4;
const DEFAULT_SCAN_QUEUE_TIMEOUT_MS = 20_000;
const scanSemaphore = createSemaphore(positiveInteger(process.env.FACILITIES_SCAN_CONCURRENCY, DEFAULT_SCAN_CONCURRENCY));

export function createFacilitiesScannerFromEnv(env: Partial<NodeJS.ProcessEnv> = process.env): FacilitiesFileScanner {
  if (isUploadAntivirusDisabled(env)) return new DisabledAntivirusScanner();
  // Development escape hatch: when explicitly opted in and never in production,
  // skip scanning so local work is not blocked without a clamd service. The server
  // runs with NODE_ENV=production, so this branch cannot run there; provision clamd
  // and set FACILITIES_CLAMAV_HOST/PORT unless the separate owner bypass is set.
  if (env.NODE_ENV !== "production" && isDevScanBypassEnabled(env)) {
    return new PassthroughFacilitiesFileScanner();
  }

  const host = env.FACILITIES_CLAMAV_HOST?.trim();
  const port = Number(env.FACILITIES_CLAMAV_PORT);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65_535) {
    return new UnavailableFacilitiesFileScanner();
  }
  const timeoutMs = env.FACILITIES_CLAMAV_TIMEOUT_MS ? Number(env.FACILITIES_CLAMAV_TIMEOUT_MS) : undefined;
  const chunkSize = env.FACILITIES_CLAMAV_CHUNK_SIZE ? Number(env.FACILITIES_CLAMAV_CHUNK_SIZE) : undefined;
  if ((timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs < 1)) || (chunkSize !== undefined && (!Number.isInteger(chunkSize) || chunkSize < 1))) {
    return new UnavailableFacilitiesFileScanner();
  }
  return limitScannerConcurrency(
    new ClamdInstreamFacilitiesFileScanner({ host, port, timeoutMs, chunkSize }),
    scanSemaphore,
    positiveInteger(env.FACILITIES_SCAN_QUEUE_TIMEOUT_MS, DEFAULT_SCAN_QUEUE_TIMEOUT_MS),
  );
}

function isDevScanBypassEnabled(env: Partial<NodeJS.ProcessEnv>): boolean {
  const value = env.FACILITIES_SCANNER_DEV_PASSTHROUGH?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function sendClamdInstreamRequest(input: {
  host: string;
  port: number;
  timeoutMs: number;
  chunkSize: number;
  bytes: Buffer;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: input.host, port: input.port });
    const response: Buffer[] = [];
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      callback();
    };

    socket.setTimeout(input.timeoutMs);
    socket.once("error", () => finish(() => reject(new Error("clamd unavailable"))));
    socket.once("timeout", () => finish(() => reject(new Error("clamd timed out"))));
    socket.on("data", (chunk: Buffer) => {
      response.push(Buffer.from(chunk));
      const reply = Buffer.concat(response);
      // clamd's zINSTREAM reply is NUL-terminated. Bound a hostile or broken
      // endpoint's response and finish as soon as the protocol response arrives.
      if (reply.byteLength > 16 * 1024) {
        finish(() => reject(new Error("clamd response too large")));
      } else if (reply.includes(0)) {
        finish(() => resolve(reply.toString("utf8")));
      }
    });
    socket.once("close", () => {
      if (!settled) {
        settled = true;
        resolve(Buffer.concat(response).toString("utf8"));
      }
    });
    socket.once("connect", async () => {
      try {
        await writeWithBackpressure(socket, Buffer.from("zINSTREAM\0"));
        for (let offset = 0; offset < input.bytes.byteLength; offset += input.chunkSize) {
          const chunk = input.bytes.subarray(offset, Math.min(offset + input.chunkSize, input.bytes.byteLength));
          const length = Buffer.allocUnsafe(4);
          length.writeUInt32BE(chunk.byteLength);
          await writeWithBackpressure(socket, length);
          await writeWithBackpressure(socket, chunk);
        }
        await writeWithBackpressure(socket, Buffer.alloc(4));
      } catch (error) {
        finish(() => reject(error));
      }
    });
  });
}

function writeWithBackpressure(socket: net.Socket, bytes: Buffer): Promise<void> {
  if (socket.write(bytes)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onDrain = () => cleanup(resolve);
    const onError = (error: Error) => cleanup(() => reject(error));
    const cleanup = (callback: () => void) => {
      socket.off("drain", onDrain);
      socket.off("error", onError);
      callback();
    };
    socket.once("drain", onDrain);
    socket.once("error", onError);
  });
}
