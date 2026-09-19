import { createHash, randomUUID } from "node:crypto";

import {
  FacilitiesFileBindingScope,
  FacilitiesFileFailureReason,
  FacilitiesFileLifecycleStatus,
  StoredFileScanStatus,
  StoredFileType,
} from "@prisma/client";

import { db } from "@/lib/db";
import { FacilitiesFileError } from "@/lib/facilities-files/errors";
import { stageVerifyScanPromoteFacilitiesFile } from "@/lib/facilities-files/lifecycle";
import type { FacilitiesFileScanner } from "@/lib/facilities-files/scanner";
import type { FacilitiesPrivateStorage, FacilitiesStorageKey } from "@/lib/facilities-files/storage";
import { asBuffer, verifyFacilitiesUpload } from "@/lib/facilities-files/verification";
import { assertBindingEditable, lockFacilitiesBinding, fileDatabaseNow, setUploadOutcome, failPendingFacilitiesUpload, commitFacilitiesUpload, FILE_TRANSACTION_OPTIONS } from "./coordination";

export type FacilitiesFileCommitResult = {
  attemptId: string;
  uploadId?: string;
  fileId?: string;
  lifecycleStatus: FacilitiesFileLifecycleStatus;
  idempotent: boolean;
};

function ensureIdempotencyKey(key: string) {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) {
    throw new FacilitiesFileError("UNSUPPORTED_FILENAME");
  }
}

function failureFromError(error: unknown): { status: FacilitiesFileLifecycleStatus; reason: FacilitiesFileFailureReason } {
  if (error instanceof FacilitiesFileError) {
    switch (error.code) {
      case "FILE_TOO_LARGE":
        return { status: "OVERSIZED", reason: "FILE_TOO_LARGE" };
      case "UNSUPPORTED_FILENAME":
        return { status: "DISALLOWED", reason: "DISALLOWED_TYPE" };
      case "CONTENT_TYPE_MISMATCH":
        return { status: "DISALLOWED", reason: "CONTENT_TYPE_MISMATCH" };
      case "CONTENT_CORRUPT":
      case "ZIP_UNSAFE":
        return { status: "CORRUPT", reason: "CONTENT_CORRUPT" };
      default:
        return { status: "FAILED", reason: "STORAGE_WRITE_FAILED" };
    }
  }
  return { status: "FAILED", reason: "STORAGE_WRITE_FAILED" };
}

async function requireOwnedBinding(owner: { userId?: string; adminId?: string }, bindingId: string) {
  if ((owner.userId ? 1 : 0) + (owner.adminId ? 1 : 0) !== 1) throw new Error("FACILITIES_FILE_FORBIDDEN");
  const binding = await db.facilitiesFileBinding.findFirst({
    where: { id: bindingId, ...(owner.userId ? { userId: owner.userId } : { adminId: owner.adminId }) },
    include: { currentUpload: true },
  });
  if (!binding) throw new Error("FACILITIES_FILE_FORBIDDEN");
  return binding;
}

/**
 * M3/M5 call this server-side helper only after creating an owned Company or
 * FacilitiesApplication. M2 intentionally exposes no unaffiliated upload route.
 */
export async function createOwnedFacilitiesFileBinding(input: {
  userId: string;
  companyId: string;
  applicationId?: string;
  slotKey: string;
}) {
  const scope = input.applicationId ? FacilitiesFileBindingScope.APPLICATION : FacilitiesFileBindingScope.COMPANY_PROFILE;
  const company = await db.company.findFirst({ where: { id: input.companyId, userId: input.userId } });
  if (!company) throw new Error("FACILITIES_FILE_FORBIDDEN");
  if (input.applicationId) {
    const application = await db.facilitiesApplication.findFirst({
      where: { id: input.applicationId, userId: input.userId, companyId: input.companyId },
    });
    if (!application) throw new Error("FACILITIES_FILE_FORBIDDEN");
  }
  return db.facilitiesFileBinding.create({
    data: {
      scope,
      scopeId: input.applicationId ?? input.companyId,
      userId: input.userId,
      companyId: input.companyId,
      applicationId: input.applicationId,
      slotKey: input.slotKey,
    },
  });
}

/** A template is deliberately a fresh, admin-owned binding: it can never replace
 * an earlier template version and therefore cannot schedule that version for deletion. */
export async function createAdminQuestionnaireTemplateBinding(input: { adminId: string; supplierId: string; slotKey: string }) {
  const admin = await db.admin.findFirst({ where: { id: input.adminId, active: true, role: "SUPER_ADMIN" } });
  const supplier = await db.facilitySupplier.findUnique({ where: { id: input.supplierId } });
  if (!admin || !supplier || !/^[A-Za-z0-9_.-]{1,100}$/.test(input.slotKey)) throw new Error("FACILITIES_FILE_FORBIDDEN");
  return db.facilitiesFileBinding.create({
    data: { scope: "QUESTIONNAIRE_TEMPLATE", scopeId: input.supplierId, adminId: input.adminId, slotKey: input.slotKey },
  });
}

/** If publishing a freshly scanned template fails, retain a durable deletion
 * tombstone rather than an unreachable passed object. Published versions never
 * call this helper. */
export async function scheduleUnpublishedTemplateDeletion(uploadId: string) {
  return db.$transaction(async (tx) => {
    const upload = await tx.facilitiesFileUpload.findUnique({ where: { id: uploadId }, include: { binding: true } });
    if (!upload?.storedFileId || upload.binding.scope !== "QUESTIONNAIRE_TEMPLATE") return false;
    await lockFacilitiesBinding(tx, upload.bindingId);
    if (await tx.questionnaireTemplateVersion.count({ where: { storedFileId: upload.storedFileId } })) return false;
    await tx.facilitiesFileBinding.update({where:{id:upload.bindingId},data:{currentUploadId:null}});
    await tx.facilitiesFileDeletionTombstone.upsert({ where: { uploadId }, create: { uploadId }, update: {} });
    return true;
  });
}

/**
 * Persist a replacement only after server-side type verification and a passed
 * malware scan. The database trigger serializes application quota reservations
 * and validates owner/scope/revision relationships.
 */
export async function storeOwnedFacilitiesFile(input: {
  userId?: string;
  adminId?: string;
  bindingId: string;
  idempotencyKey: string;
  fileName: string;
  bytes: Buffer | Uint8Array;
  storage: FacilitiesPrivateStorage;
  scanner: FacilitiesFileScanner;
}): Promise<FacilitiesFileCommitResult> {
  ensureIdempotencyKey(input.idempotencyKey);
  const bytes = asBuffer(input.bytes);
  const binding = await requireOwnedBinding({ userId: input.userId, adminId: input.adminId }, input.bindingId);
  const existing = await db.facilitiesFileUploadAttempt.findUnique({
    where: { bindingId_idempotencyKey: { bindingId: binding.id, idempotencyKey: input.idempotencyKey } },
  });
  if (existing) {
    const upload = existing.uploadId ? await db.facilitiesFileUpload.findUnique({ where: { id: existing.uploadId } }) : null;
    return { attemptId: existing.id, uploadId: upload?.id, fileId: upload?.storedFileId ?? undefined, lifecycleStatus: existing.lifecycleStatus, idempotent: true };
  }

  const rejectedAttempt = async (status: FacilitiesFileLifecycleStatus, reason: FacilitiesFileFailureReason) => {
    try {
      const rejected=await db.facilitiesFileUploadAttempt.create({data:{bindingId:binding.id,idempotencyKey:input.idempotencyKey,lifecycleStatus:status,failureReason:reason}});
      return {attemptId:rejected.id,lifecycleStatus:rejected.lifecycleStatus,idempotent:false};
    } catch(error) {
      const replay=await db.facilitiesFileUploadAttempt.findUnique({where:{bindingId_idempotencyKey:{bindingId:binding.id,idempotencyKey:input.idempotencyKey}}});
      if(!replay)throw error;
      return {attemptId:replay.id,uploadId:replay.uploadId??undefined,lifecycleStatus:replay.lifecycleStatus,idempotent:true};
    }
  };

  let verified;
  try {
    verified = verifyFacilitiesUpload({ fileName: input.fileName, bytes });
  } catch (error) {
    const failure = failureFromError(error);
    return rejectedAttempt(failure.status, failure.reason);
  }

  let pending: { id: string };
  let attempt: { id: string };
  try {
    const created = await db.$transaction(async (tx) => {
      const liveBinding = await lockFacilitiesBinding(tx, binding.id);
      await assertBindingEditable(tx, liveBinding);
      const latestRevision = await tx.facilitiesFileUpload.aggregate({ where: { bindingId: binding.id }, _max: { revisionNumber: true } });
      const createdAttempt = await tx.facilitiesFileUploadAttempt.create({
        data: { bindingId: binding.id, idempotencyKey: input.idempotencyKey, lifecycleStatus: FacilitiesFileLifecycleStatus.PENDING },
      });
      const createdUpload = await tx.facilitiesFileUpload.create({
        data: {
          bindingId: binding.id,
          idempotencyKey: input.idempotencyKey,
          revisionNumber: (latestRevision._max.revisionNumber ?? 0) + 1,
          replacesUploadId: liveBinding.currentUploadId ?? undefined,
          lifecycleStatus: FacilitiesFileLifecycleStatus.PENDING,
          reservedByteSize: verified.byteSize,
        },
      });
      await tx.facilitiesFileUploadAttempt.update({ where: { id: createdAttempt.id }, data: { uploadId: createdUpload.id } });
      return { attempt: createdAttempt, upload: createdUpload };
    }, FILE_TRANSACTION_OPTIONS);
    attempt = created.attempt;
    pending = created.upload;
  } catch (error) {
    const concurrentAttempt = await db.facilitiesFileUploadAttempt.findUnique({
      where: { bindingId_idempotencyKey: { bindingId: binding.id, idempotencyKey: input.idempotencyKey } },
    });
    if (concurrentAttempt) {
      const concurrentUpload = concurrentAttempt.uploadId
        ? await db.facilitiesFileUpload.findUnique({ where: { id: concurrentAttempt.uploadId } })
        : null;
      return { attemptId: concurrentAttempt.id, uploadId: concurrentUpload?.id, fileId: concurrentUpload?.storedFileId ?? undefined, lifecycleStatus: concurrentAttempt.lifecycleStatus, idempotent: true };
    }
    if (!(error instanceof Error) || !error.message.includes("quota exceeds 150 MiB")) {
      throw error;
    }
    // The trigger gives the only authoritative quota answer, including races.
    // The transaction rolled back, so this terminal attempt cannot poison a
    // revision number. A repeated key replays this safe outcome.
    return rejectedAttempt(FacilitiesFileLifecycleStatus.OVERSIZED, FacilitiesFileFailureReason.APPLICATION_QUOTA_EXCEEDED);
  }

  let staged;
  try {
    staged = await stageVerifyScanPromoteFacilitiesFile({
      fileName: input.fileName,
      bytes,
      storage: input.storage,
      scanner: input.scanner,
    });
  } catch (error) {
    const failure = failureFromError(error);
    const failed = await failPendingFacilitiesUpload(pending.id, null, failure.reason, failure.status);
    return { attemptId: attempt!.id, uploadId: failed.id, lifecycleStatus: failed.lifecycleStatus, idempotent: false };
  }

  const storedFileScanStatus = staged.scanStatus === "PASSED" ? StoredFileScanStatus.PASSED : staged.scanStatus === "FAILED" ? StoredFileScanStatus.FAILED : StoredFileScanStatus.PENDING;
  // Attach immutable metadata to the pending attempt atomically. Never delete
  // bytes on an ambiguous DB acknowledgement: they may already be referenced.
  const stored = await db.$transaction(async tx => {
    await lockFacilitiesBinding(tx, binding.id);
    const live=await tx.facilitiesFileUpload.findUniqueOrThrow({where:{id:pending.id}});
    if(live.lifecycleStatus!=="PENDING"||live.retryToken!==null)throw Error("FACILITIES_UPLOAD_CLAIM_LOST");
    const file=await tx.storedFile.create({data:{storageKey:staged.storageKey,originalName:staged.originalName,fileType:StoredFileType[staged.fileType],detectedMimeType:staged.detectedMimeType,byteSize:staged.byteSize,sha256:staged.sha256,scanStatus:storedFileScanStatus,scannedAt:staged.scanStatus!=="UNAVAILABLE"?new Date():undefined}});
    await tx.facilitiesFileUpload.update({where:{id:pending.id},data:{storedFileId:file.id}});
    return file;
  },FILE_TRANSACTION_OPTIONS);

  if(staged.scanStatus!=="PASSED") {
    const status=staged.scanStatus==="UNAVAILABLE"?FacilitiesFileLifecycleStatus.UNAVAILABLE:FacilitiesFileLifecycleStatus.FAILED;
    const reason=staged.scanStatus==="UNAVAILABLE"?(staged.scanReason==="STORAGE_UNAVAILABLE"?FacilitiesFileFailureReason.STORAGE_UNAVAILABLE:FacilitiesFileFailureReason.SCANNER_UNAVAILABLE):FacilitiesFileFailureReason.SCAN_FAILED;
    const unavailable=await db.$transaction(async tx=>{
      await lockFacilitiesBinding(tx,binding.id);
      const live=await tx.facilitiesFileUpload.findUniqueOrThrow({where:{id:pending.id}});
      if(live.lifecycleStatus!=="PENDING"||live.retryToken!==null)return live;
      return setUploadOutcome(tx,pending.id,status,reason);
    },FILE_TRANSACTION_OPTIONS);
    return {attemptId:attempt.id,uploadId:unavailable.id,fileId:stored.id,lifecycleStatus:unavailable.lifecycleStatus,idempotent:false};
  }
  try {
    const committed=await commitFacilitiesUpload(pending.id,stored.id,null,input.userId);
    return {attemptId:attempt.id,uploadId:committed.id,fileId:stored.id,lifecycleStatus:committed.lifecycleStatus,idempotent:false};
  } catch {
    // Reads and conditional failure are themselves allowed to fail closed. No
    // physical compensation occurs until durable terminal/deletion authorization.
    const current=await db.facilitiesFileUpload.findUniqueOrThrow({where:{id:pending.id}});
    if(current.lifecycleStatus==="PASSED")return {attemptId:attempt.id,uploadId:current.id,fileId:current.storedFileId??undefined,lifecycleStatus:current.lifecycleStatus,idempotent:true};
    const failed=await failPendingFacilitiesUpload(pending.id,null,FacilitiesFileFailureReason.REPLACEMENT_FAILED);
    return {attemptId:attempt.id,uploadId:failed.id,lifecycleStatus:failed.lifecycleStatus,idempotent:false};
  }
}

/** Retry the original quarantine only; one acknowledged durable claim owns I/O. */
export async function retryUnavailableFacilitiesScan(input:{uploadId:string;storage:FacilitiesPrivateStorage;scanner:FacilitiesFileScanner}) {
  const token=randomUUID();
  let upload;
  try {
    upload=await db.$transaction(async tx=>{
      const initial=await tx.facilitiesFileUpload.findUnique({where:{id:input.uploadId}});
      if(!initial)return null;
      const binding=await lockFacilitiesBinding(tx,initial.bindingId);
      const live=await tx.facilitiesFileUpload.findUniqueOrThrow({where:{id:initial.id},include:{storedFile:true}});
      if(live.lifecycleStatus!=="UNAVAILABLE"||!live.storedFile||live.storedFile.scanStatus!=="PENDING")return null;
      if((await fileDatabaseNow(tx)).getTime()-live.createdAt.getTime()>=86400000){await setUploadOutcome(tx,live.id,"FAILED","REPLACEMENT_FAILED");return null;}
      // A stale unavailable attempt retains its original quarantine until expiry.
      if(live.replacesUploadId!==binding.currentUploadId)return null;
      await assertBindingEditable(tx,binding);
      await tx.facilitiesFileUpload.update({where:{id:live.id},data:{lifecycleStatus:"PENDING",failureReason:null,retryToken:token}});
      await tx.facilitiesFileUploadAttempt.updateMany({where:{uploadId:live.id},data:{lifecycleStatus:"PENDING",failureReason:null}});
      return live;
    },FILE_TRANSACTION_OPTIONS);
  } catch { return false; }
  if(!upload?.storedFile)return false;
  const ownedOutcome=async(status:FacilitiesFileLifecycleStatus,reason:FacilitiesFileFailureReason)=>db.$transaction(async tx=>{
    await lockFacilitiesBinding(tx,upload.bindingId);
    const live=await tx.facilitiesFileUpload.findUniqueOrThrow({where:{id:upload.id}});
    if(live.lifecycleStatus!=="PENDING"||live.retryToken!==token)return false;
    if((await fileDatabaseNow(tx)).getTime()-live.createdAt.getTime()>=86400000)await setUploadOutcome(tx,live.id,"FAILED","REPLACEMENT_FAILED");
    else await setUploadOutcome(tx,live.id,status,reason);
    return true;
  },FILE_TRANSACTION_OPTIONS);
  const key=upload.storedFile.storageKey as FacilitiesStorageKey;
  let bytes:Buffer;
  try{bytes=await input.storage.readStaging(key);}catch{await ownedOutcome("INTERRUPTED","UPLOAD_INTERRUPTED");return false;}
  if(bytes.byteLength!==upload.storedFile.byteSize||!bytesMatchStoredDigest(bytes,upload.storedFile.sha256)){await ownedOutcome("CORRUPT","CONTENT_CORRUPT");return false;}
  let scan;
  try{scan=await input.scanner.scan({storageKey:key,bytes,byteSize:bytes.byteLength,sha256:upload.storedFile.sha256,fileType:upload.storedFile.fileType});}
  catch{await ownedOutcome("UNAVAILABLE","SCANNER_UNAVAILABLE");return false;}
  if(scan.status!=="PASSED"){await ownedOutcome(scan.status==="UNAVAILABLE"?"UNAVAILABLE":"FAILED",scan.status==="UNAVAILABLE"?"SCANNER_UNAVAILABLE":"SCAN_FAILED");return false;}
  const readyKey=input.storage.createReadyKey();
  try{await input.storage.promote(key,readyKey);}catch{await ownedOutcome("UNAVAILABLE","STORAGE_UNAVAILABLE");return false;}
  // Record ready ownership before committing. On uncertain DB result, preserve
  // both possible keys; the durable attempt/orphan recovery decides cleanup.
  let file;
  try{
    file=await db.$transaction(async tx=>{
      await lockFacilitiesBinding(tx,upload.bindingId);
      const live=await tx.facilitiesFileUpload.findUniqueOrThrow({where:{id:upload.id}});
      if(live.lifecycleStatus!=="PENDING"||live.retryToken!==token)throw Error("FACILITIES_UPLOAD_CLAIM_LOST");
      const passed=await tx.storedFile.create({data:{storageKey:readyKey,originalName:upload.storedFile!.originalName,fileType:upload.storedFile!.fileType,detectedMimeType:upload.storedFile!.detectedMimeType,byteSize:upload.storedFile!.byteSize,sha256:upload.storedFile!.sha256,scanStatus:"PASSED",scannedAt:new Date()}});
      await tx.facilitiesFileUpload.update({where:{id:upload.id},data:{storedFileId:passed.id}});
      await tx.storedFile.delete({where:{id:upload.storedFile!.id}});
      return passed;
    },FILE_TRANSACTION_OPTIONS);
    await commitFacilitiesUpload(upload.id,file.id,token);
    return true;
  }catch{
    const live=await db.facilitiesFileUpload.findUniqueOrThrow({where:{id:upload.id}});
    if(live.lifecycleStatus==="PASSED")return true;
    await failPendingFacilitiesUpload(upload.id,token,"REPLACEMENT_FAILED");
    return false;
  }
}

/** The original creation time also expires workers stranded in PENDING after a crash. */
export async function expireFacilitiesUpload(uploadId:string) {
  return db.$transaction(async tx=>{
    const initial=await tx.facilitiesFileUpload.findUnique({where:{id:uploadId}});if(!initial)return false;
    await lockFacilitiesBinding(tx,initial.bindingId);
    const live=await tx.facilitiesFileUpload.findUniqueOrThrow({where:{id:uploadId}});
    if(!["UNAVAILABLE","PENDING"].includes(live.lifecycleStatus)||(await fileDatabaseNow(tx)).getTime()-live.createdAt.getTime()<86400000)return false;
    await setUploadOutcome(tx,live.id,"FAILED","REPLACEMENT_FAILED");
    const binding=await tx.facilitiesFileBinding.findUniqueOrThrow({where:{id:live.bindingId}});
    if(binding.applicationId)await tx.facilitiesAuditLog.create({data:{applicationId:binding.applicationId,actorType:"SYSTEM",action:"QUARANTINE_EXPIRED",outcome:"FAILED",entityType:"FacilitiesFileUpload",entityId:live.id,metadata:{reasonCode:"RETENTION_EXPIRED",retentionHours:24}}});
    return true;
  },FILE_TRANSACTION_OPTIONS);
}

/**
 * Delete an obsolete object only after its committed replacement. A failed
 * deletion is represented by the tombstone and is safe to retry locally.
 */
async function hasProtectedFileReference(tx: import("@prisma/client").Prisma.TransactionClient, fileId:string) {
  const [row]=await tx.$queryRaw<Array<{protected:boolean}>>`SELECT (
    EXISTS(SELECT 1 FROM "QuestionnaireTemplateVersion" WHERE "storedFileId"=${fileId}) OR
    EXISTS(SELECT 1 FROM "CompanyProfileDocument" WHERE "storedFileId"=${fileId}) OR
    EXISTS(SELECT 1 FROM "FacilitiesApplicationDocument" WHERE "storedFileId"=${fileId}) OR
    EXISTS(SELECT 1 FROM "FacilitiesYearDocument" WHERE "storedFileId"=${fileId}) OR
    EXISTS(SELECT 1 FROM "FacilitiesHumanResources" WHERE "insuranceFileId"=${fileId}) OR
    EXISTS(SELECT 1 FROM "FacilitiesTrialBalance" WHERE "generalLedgerFileId"=${fileId} OR "subsidiaryLedgerFileId"=${fileId}) OR
    EXISTS(SELECT 1 FROM "FacilitiesCreditReport" WHERE "storedFileId"=${fileId})
  ) AS protected`;
  return row.protected;
}

export async function reconcileFacilitiesDeletion(input:{tombstoneId:string;storage:FacilitiesPrivateStorage}) {
  const initial=await db.facilitiesFileDeletionTombstone.findUnique({where:{id:input.tombstoneId},include:{upload:true}});
  if(!initial)return false;
  try {
    return await db.$transaction(async tx=>{
      const binding=await lockFacilitiesBinding(tx,initial.upload.bindingId);
      const tombstone=await tx.facilitiesFileDeletionTombstone.findUniqueOrThrow({where:{id:input.tombstoneId},include:{upload:{include:{storedFile:true}}}});
      if(binding.currentUploadId===tombstone.uploadId || ["PENDING","UNAVAILABLE"].includes(tombstone.upload.lifecycleStatus))return false;
      if(!tombstone.upload.storedFile)return tombstone.status==="SUCCEEDED";
      await tx.$queryRaw`SELECT "id" FROM "StoredFile" WHERE "id"=${tombstone.upload.storedFile.id} FOR UPDATE`;
      if(await hasProtectedFileReference(tx,tombstone.upload.storedFile.id))return false;
      // Binding lock serializes template publication; committed lineage prevents
      // rebinding old content. Safe to retry unlink after any acknowledgement loss.
      await input.storage.remove(tombstone.upload.storedFile.storageKey as FacilitiesStorageKey);
      await tx.facilitiesFileDeletionTombstone.update({where:{id:tombstone.id},data:{status:"SUCCEEDED",attemptCount:{increment:1},lastAttemptAt:new Date(),completedAt:new Date(),lastError:null,nextAttemptAt:null}});
      await tx.facilitiesFileUpload.update({where:{id:tombstone.upload.id},data:{storedFileId:null}});
      await tx.storedFile.delete({where:{id:tombstone.upload.storedFile.id}});
      return true;
    },FILE_TRANSACTION_OPTIONS);
  }catch{
    // A successful-but-unacknowledged transaction must never regress its tombstone.
    await db.facilitiesFileDeletionTombstone.updateMany({where:{id:input.tombstoneId,status:{not:"SUCCEEDED"}},data:{status:"RETRY_REQUIRED",attemptCount:{increment:1},lastAttemptAt:new Date(),lastError:"DELETION_FAILED",nextAttemptAt:new Date(Date.now()+60000)}}).catch(()=>undefined);
    return false;
  }
}

/** Purge terminal quarantine bytes while retaining the safe attempt/revision row. */
export async function reconcileTerminalFacilitiesQuarantine(input:{uploadId:string;storage:FacilitiesPrivateStorage}) {
  const upload=await db.facilitiesFileUpload.findUnique({where:{id:input.uploadId}});
  if(!upload)return false;
  try {
    const id=await db.$transaction(async tx=>{
      const binding=await lockFacilitiesBinding(tx,upload.bindingId);
      const live=await tx.facilitiesFileUpload.findUniqueOrThrow({where:{id:upload.id}});
      if(!live.storedFileId||["PASSED","PENDING","UNAVAILABLE"].includes(live.lifecycleStatus)||binding.currentUploadId===live.id)return null;
      const tombstone=await tx.facilitiesFileDeletionTombstone.upsert({where:{uploadId:live.id},create:{uploadId:live.id},update:{}});
      return tombstone.id;
    },FILE_TRANSACTION_OPTIONS);
    return id?reconcileFacilitiesDeletion({tombstoneId:id,storage:input.storage}):false;
  }catch{return false;}
}

export function bytesMatchStoredDigest(bytes: Buffer, sha256: string) {
  return createHash("sha256").update(bytes).digest("hex") === sha256;
}
