import pathlib,json,subprocess,urllib.parse,hashlib
root=pathlib.Path('/Users/mahdi/Documents/work/ioiv');e=root/'docs/security-remediation-2026-09-18/phase-8';i=json.loads((e/'environment.json').read_text());cid=i['containerId'];env=json.loads((pathlib.Path(i['run'])/'env.json').read_text());src=pathlib.Path(i['source'])
assert subprocess.check_output(['docker','inspect','--format','{{index .Config.Labels "sana.task"}}',cid],text=True).strip()==i['container']
def sql(body,name,dbname='phase1'):
 r=subprocess.run(['docker','exec','-i',cid,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d',dbname],input=body,text=True,capture_output=True);(e/name).write_text(r.stdout+r.stderr);assert r.returncode==0,(name,r.stderr);return r.stdout
# These rollback fixture suites include their administrative setup, as in existing scripts.
results={}
for name in ['facilities-foundation','facilities-private-files','facilities-m6-payment','facilities-m7-review','facilities-m8-operations']:
 body=(root/'prisma/tests'/f'{name}.integration.sql').read_text().replace('ROLLBACK;','SET CONSTRAINTS ALL IMMEDIATE;\nROLLBACK;');sql(body,name+'-final.log');results[name]='PASS owner fixture suite, deferred constraints forced'
body=(e/'restricted-m2.sql').read_text().replace('ROLLBACK;', (e/'r7-quota-extension.sql').read_text()+'\nROLLBACK;');sql(body,'restricted-r7-quota-final.log');results['restricted-r7-quota']='PASS all lifecycle/quota actions SET LOCAL ROLE phase1_runtime after admin fixture'
role='''BEGIN; SET LOCAL ROLE phase1_runtime;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls)) THEN RAISE EXCEPTION 'unsafe runtime attributes'; END IF;
 PERFORM count(*) FROM "FacilitiesFileLineageRepair";
 BEGIN UPDATE "FacilitiesFileLineageRepair" SET "attemptedRevisionNumber"=1 WHERE false; RAISE EXCEPTION 'repair update allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM "FacilitiesFileLineageRepair" WHERE false; RAISE EXCEPTION 'repair delete allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN TRUNCATE "FacilitiesFileLineageRepair"; RAISE EXCEPTION 'repair truncate allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN ALTER TABLE "FacilitiesFileUpload" DISABLE TRIGGER ALL; RAISE EXCEPTION 'trigger bypass allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$; ROLLBACK;'''
sql(role,'restricted-role-final.log');results['restricted-role']='PASS repair readonly, no DDL/trigger bypass, restricted role attributes'
# M9 provisioning uses a separate empty task-owned database; no enablement or seed users/admins.
sql('CREATE DATABASE phase8_m9','m9-create-db.log','postgres');m9env={**env,'DATABASE_URL':urllib.parse.urlunsplit(urllib.parse.urlsplit(env['PHASE1_OWNER_URL'])._replace(path='/phase8_m9'))}
with (e/'m9-final.log').open('w') as log:
 for command in [[str(src/'node_modules/.bin/prisma'),'migrate','deploy'],[str(src/'node_modules/.bin/tsx'),'scripts/provision-facilities-suppliers.ts'],[str(src/'node_modules/.bin/tsx'),'scripts/provision-facilities-suppliers.ts','--apply'],[str(src/'node_modules/.bin/tsx'),'scripts/provision-facilities-suppliers.ts','--apply']]:
  subprocess.run(command,cwd=src,env=m9env,stdout=log,stderr=subprocess.STDOUT,check=True)
sql((root/'prisma/tests/facilities-m9-supplier-provisioning.integration.sql').read_text(),'m9-assertions-final.log','phase8_m9');results['m9']='PASS dry-run, apply twice, exactly four suppliers and no programme/intake/template/user/admin'
(e/'sql-suite-results-final.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
