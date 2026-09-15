import { afterEach, describe, expect, it, vi } from "vitest";
import { createSemaphore, limitScannerConcurrency, type FacilitiesFileScanner, type FacilitiesScanRequest } from "@/lib/facilities-files/scanner";

const request: FacilitiesScanRequest = { storageKey: "staging/00000000-0000-4000-8000-000000000001", byteSize: 1, sha256: "a", fileType: "PDF", bytes: Buffer.from("x") };

function deferredScanner() {
  const pending: Array<(result: { status: "PASSED" }) => void> = [];
  const rejecters: Array<(error: Error) => void> = [];
  const scanner: FacilitiesFileScanner = {
    scan: () => new Promise((resolve, reject) => { pending.push(resolve); rejecters.push(reject); }),
  };
  return { scanner, pending, rejecters };
}

describe("scan concurrency limiter", () => {
  afterEach(() => vi.useRealTimers());

  it("runs at most the configured number of scans at once and starts the next on release", async () => {
    const { scanner, pending } = deferredScanner();
    const limited = limitScannerConcurrency(scanner, createSemaphore(2), 1_000);

    const results = [limited.scan(request), limited.scan(request), limited.scan(request)];
    await Promise.resolve();
    expect(pending).toHaveLength(2);

    pending[0]({ status: "PASSED" });
    await results[0];
    await Promise.resolve();
    expect(pending).toHaveLength(3);
  });

  it("reports UNAVAILABLE when the queue wait exceeds the timeout, without calling the scanner", async () => {
    vi.useFakeTimers();
    const { scanner, pending } = deferredScanner();
    const limited = limitScannerConcurrency(scanner, createSemaphore(1), 5_000);

    const first = limited.scan(request);
    const second = limited.scan(request);
    await vi.advanceTimersByTimeAsync(5_001);

    await expect(second).resolves.toEqual({ status: "UNAVAILABLE", reason: "SCANNER_UNAVAILABLE" });
    expect(pending).toHaveLength(1);
    pending[0]({ status: "PASSED" });
    await expect(first).resolves.toEqual({ status: "PASSED" });
  });

  it("releases the slot when the underlying scanner rejects", async () => {
    const { scanner, pending, rejecters } = deferredScanner();
    const limited = limitScannerConcurrency(scanner, createSemaphore(1), 1_000);

    const first = limited.scan(request);
    const second = limited.scan(request);
    await Promise.resolve();
    rejecters[0](new Error("socket closed"));
    await expect(first).rejects.toThrow("socket closed");
    await Promise.resolve();
    expect(pending).toHaveLength(2);
    pending[1]({ status: "PASSED" });
    await expect(second).resolves.toEqual({ status: "PASSED" });
  });
});
