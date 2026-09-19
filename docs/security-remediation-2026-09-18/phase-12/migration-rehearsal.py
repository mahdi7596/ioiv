import json,pathlib,subprocess
root=pathlib.Path.cwd();e=root/'docs/security-remediation-2026-09-18/phase-12';info=json.loads((e/'environment.json').read_text());cid=info['containerId']
assert subprocess.check_output(['docker','inspect','--format','{{index .Config.Labels "sana.task"}}',cid],text=True).strip()==info['container']
def sql(text,db='phase12_rehearsal',fail=False):
 p=subprocess.run(['docker','exec','-i',cid,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],input=text,text=True,capture_output=True);assert (p.returncode!=0)==fail,p.stderr;return p.stdout.strip()
sql('DROP DATABASE IF EXISTS phase12_rehearsal; CREATE DATABASE phase12_rehearsal','postgres')
migrations=sorted((root/'prisma/migrations').glob('*/migration.sql'))
for p in migrations[:-2]:sql(p.read_text())
fixture=(root/'prisma/tests/facilities-m6-payment.integration.sql').read_text().split('INSERT INTO "FacilitiesPaymentAttempt"')[0]
import re
fixture=re.sub(r'\\set[^\n]*\n','',fixture).replace('BEGIN;','')
statements=[]
for st in fixture.split(';'):
 if not st.strip() or 'INSERT INTO "FacilitiesProgramConfiguration"' in st:continue
 if 'INSERT INTO "FacilitiesApplication"' in st:statements.extend(['SET LOCAL session_replication_role=replica',st,'SET LOCAL session_replication_role=origin'])
 else:statements.append(st)
sql('BEGIN;'+ ';'.join(statements)+';COMMIT;')
sql('''INSERT INTO "FacilitiesCorrectionRequest" (id,"applicationId",sequence,"reviewerId",note) VALUES ('historical-correction','m6-payment-application',1,'m6-payment-admin','مدارک اصلاح شود')''')
def snapshot():return sql('''SELECT json_build_object('app',(SELECT to_jsonb(a)-'reviewVersion' FROM "FacilitiesApplication" a WHERE id='m6-payment-application'),'correction',(SELECT to_jsonb(c) FROM "FacilitiesCorrectionRequest" c WHERE id='historical-correction'),'admin',(SELECT to_jsonb(a) FROM "Admin" a WHERE id='m6-payment-admin'));''')
before=snapshot();results=[]
for p in migrations[-2:]:
 check=sql('''SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='FacilitiesCorrectionRequest_sms_state_check' ''')
 sql(p.read_text().replace('COMMIT;','SELECT 1/0;\nCOMMIT;'),fail=True)
 assert snapshot()==before
 assert sql('''SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='FacilitiesCorrectionRequest_sms_state_check' ''')==check
 if 'admin_review' in str(p):assert sql("SELECT to_regprocedure('public.lock_review_admin(text)') IS NULL")=='t'
 sql(p.read_text());assert snapshot()==before;results.append({'migration':p.parent.name,'precommitRollback':True,'historicalRowsUnchanged':True})
assert sql('SELECT "reviewVersion" FROM "FacilitiesApplication" WHERE id=\'m6-payment-application\'')=='0'
(e/'migration-rehearsal.json').write_text(json.dumps({'priorMigrations':len(migrations)-2,'newMigrations':results,'backfillVersion':0,'productionAccess':False},indent=2)+'\n');print('36 migrations; both rollback injections and historical preservation passed')
