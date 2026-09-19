import json,pathlib,subprocess,hashlib
root=pathlib.Path('/Users/mahdi/Documents/work/ioiv'); e=root/'docs/security-remediation-2026-09-18/phase-8'; info=json.loads((e/'environment.json').read_text()); cid=info['containerId']; name='phase8_migration4'
assert subprocess.check_output(['docker','inspect','--format','{{index .Config.Labels "sana.task"}}',cid],text=True).strip()==info['container']
log=(e/'migration-rehearsal.log').open('w')
def sql(body,database=name,ok=True):
 r=subprocess.run(['docker','exec','-i',cid,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d',database],input=body,text=True,capture_output=True)
 log.write(r.stdout+r.stderr);log.flush()
 if ok and r.returncode:raise RuntimeError(r.stderr)
 return r
assert sql("SELECT datname FROM pg_database WHERE datname='phase8_migration4'",'postgres').stdout.count(name)==0
sql('CREATE DATABASE phase8_migration4','postgres')
ms=sorted((root/'prisma/migrations').glob('*/migration.sql'));candidate=ms[-1];assert candidate.parent.name=='20260919140000_facilities_committed_file_lineage'
for m in ms[:-1]:
 log.write('\nBASELINE '+m.parent.name+'\n');sql(m.read_text())
fixture=(root/'prisma/tests/facilities-private-files.integration.sql').read_text().replace('ROLLBACK;','COMMIT;').replace(', \"retryToken\" = \'m2-fixture-exclusive-retry\'', '')
sql(fixture)
# Historical failed replacement keeps its attempted predecessor/revision intact.
sql('''INSERT INTO "FacilitiesFileUpload" ("id","bindingId","idempotencyKey","revisionNumber","replacesUploadId","reservedByteSize","lifecycleStatus","failureReason","updatedAt") VALUES ('r7-history-failed','m2-file-binding-1','r7-history-failed-key',3,'m2-file-upload-2',26214400,'FAILED','SCAN_FAILED',CURRENT_TIMESTAMP);''')
# Inject only a current-pointer ambiguity in isolated owner fixture.
sql('''ALTER TABLE "FacilitiesFileBinding" DISABLE TRIGGER "FacilitiesFileBinding_current_upload_integrity"; UPDATE "FacilitiesFileBinding" SET "currentUploadId"='m2-file-upload-1' WHERE "id"='m2-file-binding-1'; ALTER TABLE "FacilitiesFileBinding" ENABLE TRIGGER "FacilitiesFileBinding_current_upload_integrity";''')
r=sql(candidate.read_text(),ok=False);assert r.returncode and 'manual ambiguity review' in r.stderr
r=sql('''SELECT column_name FROM information_schema.columns WHERE table_name='FacilitiesFileUpload' AND column_name='committedRevisionNumber';''');assert 'committedRevisionNumber' not in r.stdout
sql('''ALTER TABLE "FacilitiesFileBinding" DISABLE TRIGGER "FacilitiesFileBinding_current_upload_integrity"; UPDATE "FacilitiesFileBinding" SET "currentUploadId"='m2-file-upload-2' WHERE "id"='m2-file-binding-1'; ALTER TABLE "FacilitiesFileBinding" ENABLE TRIGGER "FacilitiesFileBinding_current_upload_integrity";''')
sql(candidate.read_text())
sql('''DO $$ BEGIN
 IF (SELECT count(*) FROM "FacilitiesFileLineageRepair")<>3 THEN RAISE EXCEPTION 'wrong repair count'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "FacilitiesFileUpload" WHERE "id"='m2-file-upload-1' AND "committedRevisionNumber"=1 AND "storedFileId" IS NULL) THEN RAISE EXCEPTION 'deleted successful history lost'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "FacilitiesFileUpload" WHERE "id"='m2-file-upload-2' AND "committedRevisionNumber"=2 AND "committedPredecessorId"='m2-file-upload-1') THEN RAISE EXCEPTION 'successor backfill wrong'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "FacilitiesFileUpload" WHERE "id"='r7-history-failed' AND "revisionNumber"=3 AND "replacesUploadId"='m2-file-upload-2' AND "committedRevisionNumber" IS NULL) THEN RAISE EXCEPTION 'attempt evidence mutated'; END IF;
 BEGIN UPDATE "FacilitiesFileLineageRepair" SET "attemptedRevisionNumber"=99; RAISE EXCEPTION 'repair mutable'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%evidence is immutable%' THEN RAISE; END IF; END;
END $$;''')
log.write('PASS baseline29, ambiguous migration atomic rollback, corrected rerun, deleted successful history backfill, immutable failed identity/repair. Candidate SHA256 '+hashlib.sha256(candidate.read_bytes()).hexdigest()+'\n');log.close();print('migration rehearsal passed')
