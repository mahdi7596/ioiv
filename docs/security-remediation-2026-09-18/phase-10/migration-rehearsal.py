import pathlib,json,subprocess,shutil,hashlib
root=pathlib.Path.cwd();e=root/'docs/security-remediation-2026-09-18/phase-10';i=json.loads((e/'environment.json').read_text());env=json.loads((pathlib.Path(i['run'])/'env.json').read_text());cid=i['containerId'];src=pathlib.Path(i['source'])
assert subprocess.check_output(['docker','inspect','--format','{{index .Config.Labels "sana.task"}}',cid],text=True).strip()==i['container']
def sql(body,name,db='phase10_migration_final',ok=True):
 r=subprocess.run(['docker','exec','-i',cid,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],input=body,text=True,capture_output=True);(e/name).write_text(r.stdout+r.stderr);assert (r.returncode==0)==ok,(name,r.stderr);return r.stdout.strip()
sql('CREATE DATABASE phase10_migration_final','migration-create-db.log','postgres')
# Replay immutable prior migrations into a separate task-owned database.
prior=sorted(p for p in (root/'prisma/migrations').iterdir() if p.is_dir() and p.name<'20260919160000')
for n,p in enumerate(prior):sql((p/'migration.sql').read_text(),f'migration-prior-{n:02}.log')
fixture='''BEGIN;
INSERT INTO "User" (id,mobile,"updatedAt") VALUES ('r10-history-user','r10-history-mobile',now());
INSERT INTO "Application" (id,"userId",mobile,"companyNationalId","updatedAt") VALUES ('r10-history-app','r10-history-user','r10-history-mobile','r10-history-company',now());
INSERT INTO "ApplicationFile" (id,"applicationId","fieldKey","originalName","mimeType",size,"storagePath") VALUES ('r10-history-file','r10-history-app','creditReports.ceo','history.csv','text/csv',4,'/synthetic/history-r10-uuid.csv');
UPDATE "Application" SET "creditReports"='{"ceo":{"fileId":"r10-history-file","name":"history.csv"}}',"draftVersion"=1 WHERE id='r10-history-app';
INSERT INTO "LegacyFileBinding" (id,"applicationId","slotKey","currentFileId",generation) VALUES ('r10-history-binding','r10-history-app','creditReports.ceo','r10-history-file',1);
COMMIT;
'''
sql(fixture,'migration-history-fixture.log')
query='SELECT row_to_json(f)::text FROM "ApplicationFile" f WHERE id=\'r10-history-file\';'
before=sql(query,'migration-before.json')
p=root/'prisma/migrations/20260919160000_legacy_file_verification/migration.sql'
failed=p.read_text().replace('COMMIT;',"DO $$ BEGIN RAISE EXCEPTION 'synthetic precommit failure'; END $$;\nCOMMIT;")
sql(failed,'migration-injected-failure.log',ok=False)
assert sql("SELECT to_regclass('public.\"LegacyFileVerification\"') IS NULL;",'migration-rollback-table.log')=='t'
assert sql(query,'migration-after-rollback.json')==before
sql(p.read_text(),'20260919160000_legacy_file_verification.log')
second=root/'prisma/migrations/20260919161000_facilities_editable_snapshot_refresh/migration.sql'
sql(second.read_text().replace('COMMIT;', "DO $$ BEGIN RAISE EXCEPTION 'synthetic snapshot precommit failure'; END $$;\nCOMMIT;"),'snapshot-migration-injected-failure.log',ok=False)
assert sql("SELECT to_regprocedure('public.clear_editable_facilities_shareholders(text)') IS NULL;",'snapshot-migration-rollback.log')=='t'
assert sql(query,'snapshot-migration-after-rollback.json')==before
sql(second.read_text(),'20260919161000_facilities_editable_snapshot_refresh.log')
assert sql(query,'migration-after.json')==before
sql((root/'prisma/facilities-runtime-role-grants.sql').read_text().replace(':"runtime_role"','phase1_runtime'),'migration-grants.log')
sql('''BEGIN;SET LOCAL ROLE phase1_runtime;
DO $$ BEGIN
 IF has_table_privilege(current_user,'"ApplicationFile"','DELETE') OR has_table_privilege(current_user,'"LegacyFileVerification"','UPDATE') OR has_table_privilege(current_user,'"LegacyFileVerification"','DELETE') OR has_table_privilege(current_user,'"FacilitiesApplicationShareholder"','DELETE') THEN RAISE EXCEPTION 'unsafe privilege'; END IF;
 BEGIN INSERT INTO "LegacyFileVerification" (id,"fileId",verdict) VALUES ('bad','r10-history-file','PASSED'); RAISE EXCEPTION 'NULL passed'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;ROLLBACK;''','migration-role.log')
(e/'migration-rehearsal.json').write_text(json.dumps({'priorMigrations':len(prior),'additiveMigrations':2,'historicalFileExactRowPreserved':True,'unknownNotPromoted':True,'precommitFailureRollbackVerifiedForBothMigrations':True,'runtimeEvidenceImmutableAndDirectDeleteDenied':True,'productionAccess':False},indent=2))
print('migration rehearsal passed: prior31 + additive2; UNKNOWN identity preserved; injected rollback; restricted role')
