import path from "node:path";
import type { Prisma } from "@prisma/client";
import { DocumentQualificationError, readPrivateDocument } from "@/lib/files/qualification";
import { finalSubmissionSchema } from "@/lib/validations/application";
import { MAX_UPLOAD_SIZE_BYTES, ALLOWED_UPLOAD_EXTENSIONS } from "@/lib/validations/shared";
import { getUploadDir, verifyLegacyUploadContent } from "./storage";
import { legacyReferences, LEGACY_CANONICAL_SLOT } from "./slots";

export function legacyDocumentLabel(slot: string): string {
  if (slot.startsWith("taxDeclarations.")) return "اظهارنامه مالیاتی";
  if (slot.startsWith("financials.")) return "صورت مالی حسابرسی‌شده";
  return ({ "humanResources.insuranceList": "لیست بیمه", "trialBalance.generalLedger": "تراز کل", "trialBalance.subsidiaryLedger": "تراز معین", "creditReports.company": "گزارش اعتباری شرکت", "creditReports.ceo": "گزارش اعتباری مدیرعامل", "creditReports.boardMember": "گزارش اعتباری عضو هیئت‌مدیره" } as Record<string,string>)[slot] ?? "مدارک پرونده";
}

/** Caller holds the application lock through the payment/submission commit. */
export async function qualifyLegacyDocuments(tx: Prisma.TransactionClient, applicationId: string, draft: object): Promise<void> {
  if (!finalSubmissionSchema.safeParse({ ...draft, acceptedTerms: true }).success) throw new DocumentQualificationError("required", "مدارک الزامی پرونده");
  const bindings = await tx.legacyFileBinding.findMany({ where: { applicationId }, include: { currentFile: { include: { verifications: { where: { verdict: { not: "UNAVAILABLE" } }, orderBy: { sequence: "desc" }, take: 1 } } } } });
  for (const [slot, ref] of legacyReferences(draft)) {
    const fail = () => new DocumentQualificationError(slot, legacyDocumentLabel(slot));
    const binding = bindings.find(b => b.slotKey === slot);
    if (!LEGACY_CANONICAL_SLOT.test(slot) || !binding || binding.currentFileId !== ref.fileId || (ref.generation !== undefined && ref.generation !== binding.generation)) throw fail();
    const file = binding.currentFile;
    if (file.applicationId !== applicationId || file.fieldKey !== slot || !(ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(path.extname(file.originalName).toLowerCase())) throw fail();
    const retired = await tx.legacyFileDeletionIntent.findUnique({ where: { predecessorId: file.id } });
    const candidate = await tx.legacyUploadCandidate.findFirst({ where: { storagePath: file.storagePath } });
    if (retired || (candidate && (candidate.status !== "COMMITTED" || candidate.fileId !== file.id))) throw fail();
    const evidence = file.verifications[0];
    const passed = evidence ? evidence.verdict === "PASSED" : file.scanVerdict === "PASSED" && !!file.verifiedAt;
    const hash = evidence ? evidence.sha256 : file.sha256;
    const mime = evidence ? evidence.mimeType : file.mimeType;
    if (!passed || !hash || (evidence && evidence.byteSize !== file.size)) throw fail();
    try {
      const bytes = await readPrivateDocument(getUploadDir(), file.storagePath, file.size, MAX_UPLOAD_SIZE_BYTES);
      const verified = verifyLegacyUploadContent(file.originalName, bytes);
      if (verified.sha256 !== hash || verified.detectedMimeType !== mime) throw fail();
    } catch { throw fail(); }
  }
}
