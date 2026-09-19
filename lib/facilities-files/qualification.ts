import path from "node:path";
import type { Prisma } from "@prisma/client";
import { DocumentQualificationError, readPrivateDocument } from "@/lib/files/qualification";
import { requiredFacilitiesSlots } from "@/lib/facilities/submission";
import { getFacilitiesStorageRoot } from "./storage";
import { MAX_FACILITIES_FILE_BYTES, verifyFacilitiesUpload } from "./verification";

import { facilitiesDocumentLabel } from "@/lib/facilities/document-labels";

/** Caller holds application lock; company lock also fences profile replacements. */
export async function qualifyFacilitiesDocuments(tx: Prisma.TransactionClient, app: { id: string; companyId: string; userId: string }): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Company" WHERE id=${app.companyId} FOR UPDATE`;
  const company = await tx.company.findUniqueOrThrow({ where: { id: app.companyId }, include: { officers: true } });
  const profileSlots = ["profile-incorporation-notice", "profile-articles-of-association", "profile-board-changes-gazette", "profile-capital-increase-gazette", ...company.officers.map(o => `officer-${o.id}-identity-package`)];
  const bindings = await tx.facilitiesFileBinding.findMany({ where: { OR: [{ applicationId: app.id }, { companyId: app.companyId, scope: "COMPANY_PROFILE" }] }, include: { currentUpload: { include: { storedFile: true, deletionTombstone: true } } } });
  for (const [profile, slots] of [[false, requiredFacilitiesSlots], [true, profileSlots]] as const) {
    for (const slot of slots) {
      const fail = () => new DocumentQualificationError(slot, facilitiesDocumentLabel(slot));
      const binding = bindings.find(b => b.slotKey === slot && b.scope === (profile ? "COMPANY_PROFILE" : "APPLICATION"));
      const upload = binding?.currentUpload;
      const file = upload?.storedFile;
      if (company.userId !== app.userId || !binding || binding.scopeId !== (profile ? app.companyId : app.id) || binding.userId !== app.userId || binding.companyId !== app.companyId || (profile ? binding.applicationId !== null : binding.applicationId !== app.id) || !upload || upload.bindingId !== binding.id || binding.currentUploadId !== upload.id || upload.lifecycleStatus !== "PASSED" || upload.deletionTombstone || !file || file.id !== upload.storedFileId || file.scanStatus !== "PASSED" || !file.scannedAt || !/^ready\/[0-9a-f-]{36}$/i.test(file.storageKey)) throw fail();
      if (slot === "questionnaire" && !["DOC", "DOCX"].includes(file.fileType)) throw fail();
      if ((slot === "licences" || slot === "active-contracts" || slot.startsWith("vat-") || slot.startsWith("officer-")) && file.fileType !== "ZIP") throw fail();
      try {
        const bytes = await readPrivateDocument(getFacilitiesStorageRoot(), path.resolve(getFacilitiesStorageRoot(), file.storageKey), file.byteSize, MAX_FACILITIES_FILE_BYTES);
        const verified = verifyFacilitiesUpload({ fileName: file.originalName, bytes });
        if (verified.sha256 !== file.sha256 || verified.fileType !== file.fileType || verified.detectedMimeType !== file.detectedMimeType) throw fail();
      } catch { throw fail(); }
    }
  }
}
