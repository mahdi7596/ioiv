import { Prisma, type FacilitiesFileFailureReason, type FacilitiesFileLifecycleStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { assertFacilitiesProfileDocumentEditable } from "@/lib/facilities/profile-lock";
import { FACILITIES_EDITABLE_STATUSES } from "@/lib/facilities/review-status";

export const FILE_TRANSACTION_OPTIONS = { maxWait: 3000, timeout: 5000 };

export async function lockFacilitiesBinding(tx: Prisma.TransactionClient, bindingId: string) {
  const scope = await tx.facilitiesFileBinding.findUniqueOrThrow({ where: { id: bindingId } });
  await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
  if (scope.applicationId) await tx.$queryRaw`SELECT "id" FROM "FacilitiesApplication" WHERE "id"=${scope.applicationId} FOR UPDATE`;
  else if (scope.companyId) await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id"=${scope.companyId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "FacilitiesFileBinding" WHERE "id"=${bindingId} FOR UPDATE`;
  return tx.facilitiesFileBinding.findUniqueOrThrow({ where: { id: bindingId } });
}

export async function assertBindingEditable(tx: Prisma.TransactionClient, binding: Awaited<ReturnType<typeof lockFacilitiesBinding>>) {
  if (binding.scope === "COMPANY_PROFILE" && binding.companyId) await assertFacilitiesProfileDocumentEditable(tx, binding.companyId);
  if (binding.applicationId && !await tx.facilitiesApplication.count({where:{id:binding.applicationId,status:{in:FACILITIES_EDITABLE_STATUSES}}})) throw new Error("FACILITIES_APPLICATION_NOT_EDITABLE");
  if (binding.scope === "QUESTIONNAIRE_TEMPLATE" && !await tx.admin.count({where:{id:binding.adminId!,active:true,role:"SUPER_ADMIN"}})) throw new Error("FACILITIES_FILE_FORBIDDEN");
}

export async function fileDatabaseNow(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<Array<{at:Date}>>`SELECT clock_timestamp() AS at`;
  return row.at;
}

export async function setUploadOutcome(tx: Prisma.TransactionClient, id: string, status: FacilitiesFileLifecycleStatus, reason: FacilitiesFileFailureReason | null, storedFileId?: string) {
  const upload = await tx.facilitiesFileUpload.update({where:{id},data:{lifecycleStatus:status,failureReason:reason,...(storedFileId?{storedFileId}:{})}});
  await tx.facilitiesFileUploadAttempt.updateMany({where:{uploadId:id},data:{lifecycleStatus:status,failureReason:reason}});
  return upload;
}

/** Only an owned pending operation may fail. Never regress a committed winner. */
export async function failPendingFacilitiesUpload(id: string, token: string | null, reason: FacilitiesFileFailureReason, status: FacilitiesFileLifecycleStatus = "FAILED") {
  return db.$transaction(async tx => {
    const initial=await tx.facilitiesFileUpload.findUniqueOrThrow({where:{id}});
    await lockFacilitiesBinding(tx,initial.bindingId);
    const live=await tx.facilitiesFileUpload.findUniqueOrThrow({where:{id}});
    if(live.lifecycleStatus!=="PENDING"||live.retryToken!==token)return live;
    const failed=await setUploadOutcome(tx,id,status,reason);
    if(failed.storedFileId)await tx.facilitiesFileDeletionTombstone.upsert({where:{uploadId:id},create:{uploadId:id},update:{}});
    return failed;
  },FILE_TRANSACTION_OPTIONS);
}

export async function commitFacilitiesUpload(id:string,storedFileId:string,token:string|null,actorId?:string) {
  return db.$transaction(async tx=>{
    const initial=await tx.facilitiesFileUpload.findUniqueOrThrow({where:{id}});
    const binding=await lockFacilitiesBinding(tx,initial.bindingId);
    const live=await tx.facilitiesFileUpload.findUniqueOrThrow({where:{id}});
    if(live.lifecycleStatus==="PASSED" && live.storedFileId===storedFileId)return live;
    if(live.lifecycleStatus!=="PENDING"||live.retryToken!==token)throw Error("FACILITIES_UPLOAD_CLAIM_LOST");
    await assertBindingEditable(tx,binding);
    if((await fileDatabaseNow(tx)).getTime()-live.createdAt.getTime()>=86400000)throw Error("FACILITIES_UPLOAD_EXPIRED");
    if(live.replacesUploadId!==binding.currentUploadId)throw Error("FACILITIES_REPLACEMENT_STALE");
    const result=await setUploadOutcome(tx,id,"PASSED",null,storedFileId);
    await tx.facilitiesFileBinding.update({where:{id:binding.id},data:{currentUploadId:id}});
    if(binding.applicationId)await tx.facilitiesAuditLog.create({data:{applicationId:binding.applicationId,actorType:actorId?"USER":"SYSTEM",actorId,
      action:binding.currentUploadId?"FILE_REPLACED":"FILE_ATTACHED",outcome:"SUCCEEDED",entityType:"FacilitiesFileBinding",entityId:binding.id,
      metadata:binding.currentUploadId?{uploadId:id,revisionId:binding.currentUploadId}:{uploadId:id,fileId:storedFileId}}});
    if(binding.currentUploadId)await tx.facilitiesFileDeletionTombstone.upsert({where:{uploadId:binding.currentUploadId},create:{uploadId:binding.currentUploadId},update:{}});
    return result;
  },FILE_TRANSACTION_OPTIONS);
}
