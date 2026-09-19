import json,pathlib,subprocess,tempfile,shutil,hashlib
root=pathlib.Path('/Users/mahdi/Documents/work/ioiv');e=root/'docs/security-remediation-2026-09-18/phase-9';info=json.loads((e/'environment.json').read_text());run=pathlib.Path(info['run']);env=json.loads((run/'env.json').read_text());cid=info['containerId'];db='phase9_migration'
labels=json.loads(subprocess.check_output(['docker','inspect',cid],text=True))[0]['Config']['Labels'];assert labels.get('sana.task')==info['container']
def sql(text,database=db,check=True):
 p=subprocess.run(['docker','exec','-i',cid,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',database],input=text,text=True,capture_output=True)
 if check and p.returncode:raise RuntimeError(p.stderr)
 return p
sql('CREATE DATABASE '+db,'postgres')
scratch=pathlib.Path(tempfile.mkdtemp(prefix='migration-',dir=run));shutil.copytree(root/'prisma',scratch/'prisma');shutil.copy(root/'prisma.config.ts',scratch/'prisma.config.ts');(scratch/'node_modules').symlink_to(pathlib.Path(info['source'])/'node_modules',target_is_directory=True)
last=scratch/'prisma/migrations/20260919150000_legacy_file_bindings';shutil.rmtree(last)
env['DATABASE_URL']=env['PHASE1_OWNER_URL'].rsplit('/',1)[0]+'/'+db
with (e/'migration-rehearsal.log').open('w') as log:
 subprocess.run([str(scratch/'node_modules/.bin/prisma'),'migrate','deploy'],cwd=scratch,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
 files=run/'migration-bytes';files.mkdir();hashes={}
 for name in ['valid','duplicate','foreign','certificate-a','certificate-b']:
  f=files/(name+'.csv');f.write_text('historical synthetic '+name);hashes[str(f)]=hashlib.sha256(f.read_bytes()).hexdigest()
 sql('''INSERT INTO "User" (id,mobile,"updatedAt") VALUES ('migration-user','09000009011',now());
 INSERT INTO "Application" (id,"userId",mobile,"companyNationalId","updatedAt","taxDeclarations",financials,"humanResources","creditReports") VALUES
 ('migration-a','migration-user','09000009011','00000009011',now(),'[{}, {"file":{"fileId":"valid","name":"old"}}, {"file":{"fileId":"missing","name":"missing"}}]','[{"file":{"fileId":"duplicate","name":"dup"}},{"file":{"fileId":"duplicate","name":"dup"}}]','{"insuranceList":{"fileId":"missing-insurance","name":"missing"}}','{"ceo":{"fileId":"foreign","name":"foreign"}}'),
 ('migration-b','migration-user','09000009012','00000009012',now(),'[]','[]','{}','{}');''')
 for name,app,slot in [('valid','migration-a','taxDeclarations.1.file'),('duplicate','migration-a','financials.0.file'),('foreign','migration-b','creditReports.ceo'),('certificate-a','migration-a','validationCertificate'),('certificate-b','migration-a','validationCertificate')]:
  sql('INSERT INTO "ApplicationFile" (id,"applicationId","fieldKey","originalName","mimeType",size,"storagePath") VALUES ('+','.join("'"+str(v).replace("'","''")+"'" for v in [name,app,slot,name+'.csv','text/csv'])+',20,'+"'"+str(files/(name+'.csv'))+"');")
 before=sql('SELECT row_to_json(a) FROM "Application" a ORDER BY id; SELECT row_to_json(f) FROM "ApplicationFile" f ORDER BY id;').stdout
 migration=(root/'prisma/migrations/20260919150000_legacy_file_bindings/migration.sql').read_text()
 failure=sql(migration.replace('COMMIT;','SELECT 1/0;\nCOMMIT;'),check=False);assert failure.returncode!=0 and 'division by zero' in failure.stderr
 assert sql('SELECT count(*) FROM information_schema.tables WHERE table_name=\'LegacyFileBinding\';').stdout.strip()=='0'
 assert sql('SELECT row_to_json(a) FROM "Application" a ORDER BY id; SELECT row_to_json(f) FROM "ApplicationFile" f ORDER BY id;').stdout==before
 log.write('PASS injected precommit migration failure: full rollback; original rows unchanged\n')
 shutil.copytree(root/'prisma/migrations/20260919150000_legacy_file_bindings',last)
 subprocess.run([str(scratch/'node_modules/.bin/prisma'),'migrate','deploy'],cwd=scratch,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
 assert sql('SELECT "currentFileId" FROM "LegacyFileBinding";').stdout.strip()=='valid'
 assert sql('SELECT count(*) FROM "ApplicationFile" WHERE "scanVerdict" IS NULL AND "sha256" IS NULL;').stdout.strip()=='5'
 assert sql('SELECT count(*) FROM "LegacyFileBindingRepair";').stdout.strip()=='9'
 # Compare original fields only; added nullable evidence never changes historical values.
 after=sql('SELECT row_to_json(a)::jsonb - \'draftVersion\' FROM "Application" a ORDER BY id; SELECT row_to_json(f)::jsonb - ARRAY[\'sha256\',\'scanVerdict\',\'scannerName\',\'scannerVersion\',\'verifiedAt\'] FROM "ApplicationFile" f ORDER BY id;').stdout
 assert [json.loads(x) for x in before.splitlines()]==[json.loads(x) for x in after.splitlines()]
 for name,digest in hashes.items():assert hashlib.sha256(pathlib.Path(name).read_bytes()).hexdigest()==digest
 denied=sql('UPDATE "LegacyFileBindingRepair" SET reason=\'rewrite\';',check=False);assert denied.returncode!=0
 log.write('PASS only validated saved reference bound; nine unresolved/unbound repair records; five UNKNOWN historical files and all original JSON/bytes unchanged; repair immutable\n')
 (e/'migration-rehearsal.json').write_text(json.dumps({'database':db,'migrationCount':31,'historicalFiles':5,'boundFiles':['valid'],'repairRecords':9,'rollbackVerified':True,'originalRowsPreserved':True,'historicalByteHashes':hashes},indent=2)+'\n')
print('migration rehearsal passed')
