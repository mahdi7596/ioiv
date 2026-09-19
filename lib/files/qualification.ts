import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import path from "node:path";

export class DocumentQualificationError extends Error {
  constructor(public readonly slot: string, label: string) {
    super(`مدرک «${label}» معتبر و در دسترس نیست؛ آن را دوباره بارگذاری یا برای بررسی با پشتیبانی تماس بگیرید.`);
    this.name = "DocumentQualificationError";
  }
}

/** Bounded descriptor read: reject links, devices, escaping parents and changing bytes. */
export async function readPrivateDocument(root: string, filename: string, size: number, maximum: number): Promise<Buffer> {
  if (!Number.isSafeInteger(size) || size <= 0 || size > maximum) throw new Error("DOCUMENT_SIZE");
  const canonicalRoot = await realpath(path.resolve(root));
  const configuredRoot = path.resolve(root);
  const supplied = path.resolve(filename);
  const target = supplied.startsWith(configuredRoot + path.sep)
    ? path.resolve(canonicalRoot, path.relative(configuredRoot, supplied)) : supplied;
  if (!target.startsWith(canonicalRoot + path.sep)) throw new Error("DOCUMENT_PATH");
  if (await realpath(path.dirname(target)) !== path.dirname(target)) throw new Error("DOCUMENT_PARENT");
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size !== size) throw new Error("DOCUMENT_SIZE");
    const bytes = Buffer.alloc(size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!result.bytesRead) break;
      offset += result.bytesRead;
    }
    const after = await handle.stat();
    if (offset !== size || after.size !== size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw new Error("DOCUMENT_CHANGED");
    return bytes.subarray(0, size);
  } finally { await handle.close(); }
}
