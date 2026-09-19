-- Runs after the restricted M2 fixture, before its rollback.
UPDATE "FacilitiesFileUpload" SET "lifecycleStatus"='PENDING',"failureReason"=NULL,"retryToken"='r7-full-quota-retry' WHERE "id" LIKE 'm2-file-quota-upload-%';
INSERT INTO "FacilitiesFileUpload" ("id","bindingId","idempotencyKey","revisionNumber","replacesUploadId","reservedByteSize","lifecycleStatus","failureReason","updatedAt") VALUES ('r7-failed','m2-file-binding-1','r7-quota-failed-key',3,'m2-file-upload-2',26214400,'FAILED','SCAN_FAILED',CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesFileUpload" ("id","bindingId","idempotencyKey","revisionNumber","replacesUploadId","reservedByteSize","updatedAt") VALUES ('r7-reserve','m2-file-binding-1','r7-quota-reserve-key',4,'m2-file-upload-2',26214400,CURRENT_TIMESTAMP);
DO $$ BEGIN
 BEGIN
 INSERT INTO "FacilitiesFileUpload" ("id","bindingId","idempotencyKey","revisionNumber","replacesUploadId","reservedByteSize","updatedAt") VALUES ('r7-double-credit','m2-file-binding-1','r7-double-credit-key',5,'m2-file-upload-2',1,CURRENT_TIMESTAMP);
 RAISE EXCEPTION 'duplicate predecessor quota credit allowed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%quota exceeds 150 MiB%' THEN RAISE; END IF; END;
 BEGIN INSERT INTO "FacilitiesFileDeletionTombstone" ("id","uploadId","updatedAt") VALUES ('r7-active-delete','r7-reserve',CURRENT_TIMESTAMP); RAISE EXCEPTION 'active delete allowed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%active facilities quarantine%' AND SQLERRM NOT LIKE '%requires stored content%' THEN RAISE; END IF; END;
END $$;
UPDATE "FacilitiesFileUpload" SET "lifecycleStatus"='UNAVAILABLE',"failureReason"='SCANNER_UNAVAILABLE' WHERE "id"='r7-reserve';
INSERT INTO "FacilitiesFileUpload" ("id","bindingId","idempotencyKey","revisionNumber","replacesUploadId","reservedByteSize","updatedAt") VALUES ('r7-winner','m2-file-binding-1','r7-quota-winner-key',5,'m2-file-upload-2',26214400,CURRENT_TIMESTAMP);
INSERT INTO "StoredFile" ("id","storageKey","originalName","fileType","detectedMimeType","byteSize","sha256","scanStatus","scannedAt") VALUES ('r7-winner-file','r7-winner-key','safe.pdf','PDF','application/pdf',26214400,repeat('c',64),'PASSED',CURRENT_TIMESTAMP);
UPDATE "FacilitiesFileUpload" SET "storedFileId"='r7-winner-file',"lifecycleStatus"='PASSED' WHERE "id"='r7-winner';
UPDATE "FacilitiesFileBinding" SET "currentUploadId"='r7-winner' WHERE "id"='m2-file-binding-1';
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM "FacilitiesFileUpload" WHERE "id"='r7-winner' AND "revisionNumber"=5 AND "committedRevisionNumber"=3 AND "committedPredecessorId"='m2-file-upload-2') THEN RAISE EXCEPTION 'committed lineage wrong'; END IF;
 BEGIN UPDATE "FacilitiesFileUpload" SET "lifecycleStatus"='PENDING',"failureReason"=NULL,"retryToken"='r7-stale-retry-token' WHERE "id"='r7-reserve'; RAISE EXCEPTION 'stale retry admitted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%base is stale%' THEN RAISE; END IF; END;
END $$;
-- Obsolete but physically retained B must not monopolize logical quota.
INSERT INTO "FacilitiesFileUpload" ("id","bindingId","idempotencyKey","revisionNumber","replacesUploadId","reservedByteSize","updatedAt") VALUES ('r7-next','m2-file-binding-1','r7-quota-next-key',6,'r7-winner',26214400,CURRENT_TIMESTAMP);
SET CONSTRAINTS ALL IMMEDIATE;
