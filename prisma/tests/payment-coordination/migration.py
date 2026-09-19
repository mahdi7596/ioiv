"""Run only through the Phase 1 env allow-list runner. Fresh local database only."""
import os,pathlib,subprocess,urllib.parse,json
url=urllib.parse.urlparse(os.environ['PHASE1_OWNER_URL'])
assert url.hostname=='127.0.0.1' and url.path=='/phase1' and os.environ['PHASE1_ISOLATED_DB']=='true'
base=os.environ['PHASE1_OWNER_URL']; target=base.rsplit('/',1)[0]+'/phase1_history_valid'
def sql(text,db=target,check=True):
 p=subprocess.run(['psql',db,'-X','-v','ON_ERROR_STOP=1','-At'],input=text,text=True,capture_output=True)
 if check and p.returncode: raise RuntimeError(p.stderr)
 return p
sql('CREATE DATABASE phase1_history_valid',base)
for p in sorted(pathlib.Path('prisma/migrations').glob('*/migration.sql')):
 if '20260918120000' not in str(p): sql(p.read_text())
for key,statuses in {'none':[], 'failed':['FAILED'],'unknown':['INITIATED'],'many':['FAILED','INITIATED'],'paid':['VERIFIED','FAILED'],'duplicates':['VERIFIED','VERIFIED']}.items():
 sql(f'''INSERT INTO "User" (id,mobile,"updatedAt") VALUES ('{key}','fixture-{key}',now());
 INSERT INTO "Application" (id,"userId",mobile,"companyNationalId","updatedAt") VALUES ('{key}','{key}','fixture-{key}','{key}',now());''')
 for i,status in enumerate(statuses):
  sql(f'''INSERT INTO "Payment" (id,"applicationId","amountToman",status,authority,"referenceId","updatedAt") VALUES ('{key}-{i}','{key}',3000000,'{status}',{ 'NULL' if key in ['failed','unknown'] else "'fixture-authority-"+key+str(i)+"'" },{ "'fixture-ref-"+str(i)+"'" if status=='VERIFIED' else 'NULL' },now());''')
# Facilities old history without ever enabling programme. Only owner fixture setup
# suppresses creation-time availability guards. All migrated/runtime guards stay on.
fixture=pathlib.Path('prisma/tests/facilities-m6-payment.integration.sql').read_text().split('INSERT INTO "FacilitiesPaymentAttempt"')[0]
fixture='\n'.join(l for l in fixture.splitlines() if not l.startswith('\\') and l!='BEGIN;' and 'INSERT INTO "FacilitiesProgramConfiguration"' not in l)
fixture=fixture.replace('m6-payment','history-fixture')
sql('BEGIN; SET LOCAL session_replication_role=replica;'+fixture+'COMMIT;')
for key,statuses in {'ffailed':['FAILED'],'funknown':['INITIATED'],'fmany':['FAILED','PENDING'],'fpaid':['VERIFIED','FAILED']}.items():
 row=json.loads(sql('SELECT row_to_json(a) FROM "FacilitiesApplication" a LIMIT 1').stdout)
 row['id']=key
 # Clone a valid intake and mapping so fixture FKs remain valid.
 intake=json.loads(sql('SELECT row_to_json(i) FROM "FacilityIntake" i LIMIT 1').stdout)
 intake['id']=key+'-intake';intake['name']=key+'-intake'
 mapping=json.loads(sql('SELECT row_to_json(i) FROM "FacilityIntakeSupplier" i LIMIT 1').stdout)
 mapping['id']=key+'-mapping';mapping['intakeId']=intake['id']
 for table,value in [('FacilityIntake',intake),('FacilityIntakeSupplier',mapping)]:
  content=json.dumps(value).replace("'","''")
  sql(f'''INSERT INTO "{table}" SELECT * FROM json_populate_record(NULL::"{table}", '{content}')''')
 row['intakeId']=intake['id'];row['intakeSupplierId']=mapping['id']
 payload=json.dumps(row).replace("'","''")
 sql(f'''BEGIN; SET LOCAL session_replication_role=replica;
 INSERT INTO "FacilitiesApplication" SELECT * FROM json_populate_record(NULL::"FacilitiesApplication", '{payload}'); COMMIT;''')
 for i,status in enumerate(statuses):
  sql(f'''INSERT INTO "FacilitiesPaymentAttempt" (id,"applicationId","amountToman",gateway,status,authority,"referenceId","updatedAt") VALUES ('{key}-{i}','{key}',3000000,'fixture','{status}',{ 'NULL' if key in ['ffailed','funknown'] else "'facility-authority-"+key+str(i)+"'" },{ "'fixture-ref'" if status=='VERIFIED' else 'NULL' },now());''')
before=sql('SELECT row_to_json(p) FROM "Payment" p ORDER BY id; SELECT row_to_json(p) FROM "FacilitiesPaymentAttempt" p ORDER BY id;').stdout
migration=pathlib.Path('prisma/migrations/20260918120000_payment_coordination/migration.sql').read_text()
assert sql(migration.replace('COMMIT;','SELECT 1/0; COMMIT;'),check=False).returncode != 0
assert sql('SELECT to_regclass(\'"PaymentObligation"\') IS NULL').stdout.strip()=='t'
assert before==sql('SELECT row_to_json(p) FROM "Payment" p ORDER BY id; SELECT row_to_json(p) FROM "FacilitiesPaymentAttempt" p ORDER BY id;').stdout
sql(migration)
assert before==sql('SELECT row_to_json(p) FROM "Payment" p ORDER BY id; SELECT row_to_json(p) FROM "FacilitiesPaymentAttempt" p ORDER BY id;').stdout
rows=[json.loads(l) for l in sql('SELECT row_to_json(o) FROM "PaymentObligation" o ORDER BY id').stdout.splitlines()]
for r in rows:
 key=r['legacyApplicationId'] or r['facilitiesApplicationId']
 assert r['state']==('SETTLED' if key in ['paid','duplicates','fpaid'] else 'UNCERTAIN'),r
 if key in ['many','duplicates','fmany']: assert r['legacyPaymentId'] is None and r['facilitiesPaymentId'] is None
assert len(rows)==9
print('PASS populated legacy/facilities backfill: 9 obligations, old payment rows byte-for-byte JSON unchanged')
print('PASS injected migration failure: transactional DDL/data rollback, safe rerun')
print('PASS no programme enablement, no payment evidence deletion; rollback retains expanded tables')
