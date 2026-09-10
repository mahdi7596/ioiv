import net from "node:net";

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
  reason?: "MALWARE_DETECTED" | "SCANNER_UNAVAILABLE";
};

export interface FacilitiesFileScanner {
  scan(request: FacilitiesScanRequest): Promise<FacilitiesScanResult>;
}

export class UnavailableFacilitiesFileScanner implements FacilitiesFileScanner {
  async scan(): Promise<FacilitiesScanResult> {
    return { status: "UNAVAILABLE", reason: "SCANNER_UNAVAILABLE" };
  }
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

export function createFacilitiesScannerFromEnv(env: Partial<NodeJS.ProcessEnv> = process.env): FacilitiesFileScanner {
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
  return new ClamdInstreamFacilitiesFileScanner({ host, port, timeoutMs, chunkSize });
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
