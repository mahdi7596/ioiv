import { randomUUID } from "node:crypto";
import { chmod, link, mkdir, open, readFile, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

import { FacilitiesFileError } from "@/lib/facilities-files/errors";

export type FacilitiesStorageKey = `staging/${string}` | `ready/${string}`;

export interface FacilitiesPrivateStorage {
  createStagingKey(): FacilitiesStorageKey;
  createReadyKey(): FacilitiesStorageKey;
  writeStaging(key: FacilitiesStorageKey, bytes: Buffer): Promise<void>;
  promote(stagingKey: FacilitiesStorageKey, readyKey: FacilitiesStorageKey): Promise<void>;
  /** Internal reaper/scanner use only; never call this from a download route. */
  readStaging(key: FacilitiesStorageKey): Promise<Buffer>;
  readReady(key: FacilitiesStorageKey): Promise<Buffer>;
  remove(key: FacilitiesStorageKey): Promise<void>;
}

const STORAGE_KEY_PATTERN = /^(staging|ready)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function getFacilitiesStorageRoot(): string {
  return process.env.FACILITIES_UPLOAD_DIR || path.join(process.cwd(), "uploads", "facilities-private");
}

/**
 * Local private storage used by the facilities flow. Its accepted keys are opaque
 * UUIDs and are resolved beneath separate staging and ready roots only.
 */
export class FilesystemFacilitiesPrivateStorage implements FacilitiesPrivateStorage {
  private readonly root: string;
  private readonly stagingRoot: string;
  private readonly readyRoot: string;

  constructor(root = getFacilitiesStorageRoot()) {
    this.root = path.resolve(root);
    this.stagingRoot = path.join(this.root, "staging");
    this.readyRoot = path.join(this.root, "ready");
  }

  createStagingKey(): FacilitiesStorageKey {
    return `staging/${randomUUID()}`;
  }

  createReadyKey(): FacilitiesStorageKey {
    return `ready/${randomUUID()}`;
  }

  async writeStaging(key: FacilitiesStorageKey, bytes: Buffer): Promise<void> {
    const storagePath = this.resolveKey(key, "staging");
    await this.ensurePrivateDirectory(this.stagingRoot);
    try {
      const handle = await open(storagePath, "wx", 0o600);
      try {
        await handle.writeFile(bytes);
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (isAlreadyExists(error)) throw new FacilitiesFileError("STORAGE_CONFLICT");
      throw error;
    }
  }

  async promote(stagingKey: FacilitiesStorageKey, readyKey: FacilitiesStorageKey): Promise<void> {
    const stagingPath = this.resolveKey(stagingKey, "staging");
    const readyPath = this.resolveKey(readyKey, "ready");
    await this.ensurePrivateDirectory(this.readyRoot);
    try {
      // link is atomic and refuses to overwrite an existing destination. It also
      // avoids a brief missing-object window before the staged key is removed.
      await link(stagingPath, readyPath);
      await unlink(stagingPath);
    } catch (error) {
      if (isAlreadyExists(error)) throw new FacilitiesFileError("STORAGE_CONFLICT");
      throw error;
    }
  }

  async readStaging(key: FacilitiesStorageKey): Promise<Buffer> {
    return readFile(this.resolveKey(key, "staging"));
  }

  async readReady(key: FacilitiesStorageKey): Promise<Buffer> {
    return readFile(this.resolveKey(key, "ready"));
  }

  async remove(key: FacilitiesStorageKey): Promise<void> {
    const storagePath = this.resolveKey(key);
    try {
      await unlink(storagePath);
    } catch (error) {
      if (isNotFound(error)) return;
      throw error;
    }
  }

  /** Maintenance-only orphan discovery; never exposed to request handlers. */
  async listKeysOlderThan(ageMs: number, now = Date.now()): Promise<FacilitiesStorageKey[]> {
    const keys: FacilitiesStorageKey[] = [];
    for (const state of ["staging", "ready"] as const) {
      const directory = state === "staging" ? this.stagingRoot : this.readyRoot;
      let names: string[];
      try {
        names = await readdir(directory);
      } catch (error) {
        if (isNotFound(error)) continue;
        throw error;
      }
      for (const name of names) {
        const key = `${state}/${name}` as FacilitiesStorageKey;
        try {
          const file = await stat(this.resolveKey(key, state));
          if (file.isFile() && now - file.mtimeMs >= ageMs) keys.push(key);
        } catch (error) {
          if (!isNotFound(error)) throw error;
        }
      }
    }
    return keys;
  }

  private resolveKey(key: FacilitiesStorageKey, requiredState?: "staging" | "ready"): string {
    const match = STORAGE_KEY_PATTERN.exec(key);
    if (!match || (requiredState && match[1] !== requiredState)) {
      throw new FacilitiesFileError("STORAGE_KEY_INVALID");
    }
    const root = match[1] === "staging" ? this.stagingRoot : this.readyRoot;
    const result = path.resolve(root, match[2]);
    if (!result.startsWith(`${root}${path.sep}`)) throw new FacilitiesFileError("STORAGE_KEY_INVALID");
    return result;
  }

  private async ensurePrivateDirectory(directory: string) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    // mkdir observes umask for newly created parents; enforce private traversal
    // even when the volume was first created by a less restrictive process.
    await chmod(this.root, 0o700).catch(() => undefined);
    await chmod(directory, 0o700);
  }
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
