import pathlib,json,subprocess
root=pathlib.Path.cwd(); e=root/'docs/security-remediation-2026-09-18/phase-5'; info=json.loads((e/'environment.json').read_text());cid=info['containerId']
label=subprocess.check_output(['docker','inspect','--format','{{ index .Config.Labels "sana.task" }}',cid],text=True).strip();assert 'sana.task='+label==info['label']
def sql(query):return subprocess.run(['docker','exec','-i',cid,'psql','-v','ON_ERROR_STOP=1','-U','postgres','-d','phase5_recovery'],input=query,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
subprocess.run(['docker','exec',cid,'createdb','-U','postgres','phase5_recovery'],check=True)
try:
 assert sql('CREATE TABLE "Admin" ("id" TEXT, "mobile" TEXT, "active" BOOLEAN);').returncode==0
 migration=(root/'prisma/migrations/20260919130000_otp_request_intents/migration.sql').read_text()
 failed=sql(migration.replace('COMMIT;','SELECT 1/0; COMMIT;'));assert failed.returncode!=0;print('PASS injected migration failure rolls back')
 absent=sql("SELECT to_regclass('public.\"AuthRequestIntent\"') IS NULL AS absent;");assert 't' in absent.stdout;print(absent.stdout)
 applied=sql(migration);assert applied.returncode==0,applied.stdout;print('PASS exact migration applies after rollback')
 permissions=sql("SELECT has_function_privilege('public','public.prune_auth_request_intents()','EXECUTE') AS public_cleanup;");assert permissions.returncode==0;print(permissions.stdout)
finally:subprocess.run(['docker','exec',cid,'dropdb','-U','postgres','phase5_recovery'],check=True)
