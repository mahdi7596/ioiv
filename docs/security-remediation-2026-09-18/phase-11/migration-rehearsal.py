import json,pathlib,subprocess
root=pathlib.Path.cwd();e=root/'docs/security-remediation-2026-09-18/phase-11';info=json.loads((e/'environment.json').read_text());cid=info['containerId']
assert subprocess.check_output(['docker','inspect','--format','{{index .Config.Labels "sana.task"}}',cid],text=True).strip()==info['container']
def sql(text,db='phase11_rehearsal',fail=False):
 p=subprocess.run(['docker','exec','-i',cid,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],input=text,text=True,capture_output=True)
 assert (p.returncode!=0)==fail,p.stderr
 return p.stdout.strip()
sql('CREATE DATABASE phase11_rehearsal','postgres')
migrations=sorted((root/'prisma/migrations').glob('*/migration.sql'))
for p in migrations[:-1]:sql(p.read_text())
sql('''INSERT INTO "OtpCode" (id,mobile,purpose,"codeHash","createdAt","expiresAt") VALUES ('historical','fixture','USER_LOGIN','fixture',now()-interval '25 hours',now()-interval '24 hours')''')
new=migrations[-1].read_text();sql(new.replace('COMMIT;','SELECT 1/0;\nCOMMIT;'),fail=True)
assert sql('''SELECT to_regclass('public."MaintenanceCursor"') IS NULL AND to_regprocedure('public.prune_expired_otp_codes()') IS NULL''')=='t'
assert sql('SELECT count(*) FROM "OtpCode"')=='1'
sql(new)
assert sql('SELECT count(*) FROM "OtpCode"')=='1'
# Grant reruns must be idempotent against the actual restricted-role database.
for _ in range(2):
 p=subprocess.run(['docker','exec','-i',cid,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','phase1','-v','runtime_role=phase1_runtime'],input=(root/'prisma/facilities-runtime-role-grants.sql').read_text(),text=True,capture_output=True);assert p.returncode==0,p.stderr
(e/'migration-rehearsal.json').write_text(json.dumps({'priorMigrations':len(migrations)-1,'rollbackInjection':'passed','historicalOtpPreserved':True,'newMigrationApplied':True,'grantsReappliedTwice':True,'productionAccess':False},indent=2)+'\n')
print('34-migration rehearsal, precommit rollback, historical preservation and grant reruns passed')
