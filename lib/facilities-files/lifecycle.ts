import type { FacilitiesFileScanner, FacilitiesScanResult } from "@/lib/facilities-files/scanner";
import type { FacilitiesPrivateStorage, FacilitiesStorageKey } from "@/lib/facilities-files/storage";
import { verifyFacilitiesUpload, type VerifiedFacilitiesFile } from "@/lib/facilities-files/verification";

export type FacilitiesStagedFile = VerifiedFacilitiesFile & {
  storageKey: FacilitiesStorageKey;
  scanStatus: FacilitiesScanResult["status"];
  scanReason?: FacilitiesScanResult["reason"] | "STORAGE_UNAVAILABLE";
  quarantine: boolean;
};

/**
 * The only path to a ready object: validate bytes, store them under a random staging
 * key, and obtain a passing scan. Failed or unavailable scans remain in staging and
 * can never be read through `readReady`.
 */
export async function stageVerifyScanPromoteFacilitiesFile(input: {
  fileName: string;
  bytes: Buffer | Uint8Array;
  storage: FacilitiesPrivateStorage;
  scanner: FacilitiesFileScanner;
}): Promise<FacilitiesStagedFile> {
  const bytes = Buffer.from(input.bytes);
  const verified = verifyFacilitiesUpload({ fileName: input.fileName, bytes });
  const stagingKey = input.storage.createStagingKey();
  await input.storage.writeStaging(stagingKey, bytes);

  let scan: FacilitiesScanResult;
  try {
    scan = await input.scanner.scan({
      storageKey: stagingKey,
      byteSize: verified.byteSize,
      sha256: verified.sha256,
      fileType: verified.fileType,
      bytes,
    });
  } catch {
    scan = { status: "UNAVAILABLE", reason: "SCANNER_UNAVAILABLE" };
  }

  if (scan.status !== "PASSED") {
    return { ...verified, storageKey: stagingKey, scanStatus: scan.status, scanReason: scan.reason, quarantine: true };
  }

  const readyKey = input.storage.createReadyKey();
  try {
    await input.storage.promote(stagingKey, readyKey);
  } catch {
    // The verified bytes still exist under the private staging key. Preserve
    // them as unavailable so reconciliation can retry promotion for 24 hours.
    return { ...verified, storageKey: stagingKey, scanStatus: "UNAVAILABLE", scanReason: "STORAGE_UNAVAILABLE", quarantine: true };
  }
  return { ...verified, storageKey: readyKey, scanStatus: "PASSED", quarantine: false };
}

/** Used by a DB-coordinated retention job after recording safe failure metadata. */
export async function discardQuarantinedFacilitiesFile(storage: FacilitiesPrivateStorage, key: FacilitiesStorageKey): Promise<void> {
  if (!key.startsWith("staging/")) throw new Error("Only staging objects may be discarded as quarantined files");
  await storage.remove(key);
}
