"""Deterministic interleaving of the existing find/delete/unlink algorithm.
SQL owner is used ONLY in this disposable fixture: runtime DELETE is denied.
"""
import json,pathlib,subprocess,tempfile
here=pathlib.Path(__file__).resolve().parent
info=json.loads((here/'environment.json').read_text()); cid=info['containerId']
labels=json.loads(subprocess.check_output(['docker','inspect',cid],text=True))[0]['Config']['Labels']
assert labels.get('sana.task')==info['container']
def sql(s):
 return subprocess.check_output(['docker','exec','-i',cid,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',info['database']],input=s,text=True).strip()
root=pathlib.Path(tempfile.mkdtemp(prefix='phase9-baseline-',dir=info['run']))
a=root/'a.pdf'; b=root/'b.pdf'; a.write_bytes(b'fixture-A'); b.write_bytes(b'fixture-B')
def quote(s): return "'"+str(s).replace("'","''")+"'"
sql('''INSERT INTO "User" (id,mobile,"updatedAt") VALUES ('phase9-baseline-user','09000009001',now());
INSERT INTO "Application" (id,"userId",mobile,"companyNationalId","updatedAt") VALUES ('phase9-baseline-app','phase9-baseline-user','09000009001','00000009001',now());''')
for identity,path in [('A',a),('B',b)]:
 sql('INSERT INTO "ApplicationFile" (id,"applicationId","fieldKey","originalName","mimeType",size,"storagePath") VALUES ('+','.join(map(quote,[identity,'phase9-baseline-app','creditReports.ceo',identity+'.pdf','application/pdf']))+',9,'+quote(path)+');')
denied=sql('SELECT has_table_privilege(\'phase1_runtime\',\'"ApplicationFile"\',\'DELETE\');')
assert denied=='f'
# Both cleanup SELECTs finish before either delete; each sees the other's new file.
selectedA=sql('SELECT id FROM "ApplicationFile" WHERE "applicationId"=\'phase9-baseline-app\' AND "storagePath" <> '+quote(a)+';')
selectedB=sql('SELECT id FROM "ApplicationFile" WHERE "applicationId"=\'phase9-baseline-app\' AND "storagePath" <> '+quote(b)+';')
assert selectedA=='B' and selectedB=='A'
for selected,file in [(selectedA,b),(selectedB,a)]:
 sql('DELETE FROM "ApplicationFile" WHERE id='+quote(selected)+';'); file.unlink()
remaining=int(sql('SELECT count(*) FROM "ApplicationFile" WHERE "applicationId"=\'phase9-baseline-app\';'))
assert remaining==0 and not a.exists() and not b.exists()
result={'baseline':'REPRODUCED','algorithm':'existing select all other paths then delete rows and unlink','runtimeDeleteAllowed':False,'fixtureAuthority':'isolated SQL owner only; no grant changes','cleanupASelected':selectedA,'cleanupBSelected':selectedB,'remainingRows':remaining,'candidateAExists':a.exists(),'candidateBExists':b.exists(),'scope':'fresh labelled loopback database and synthetic bytes'}
(here/'baseline-race.json').write_text(json.dumps(result,indent=2)+'\n'); print(json.dumps(result,indent=2))
sql('DELETE FROM "Application" WHERE id=\'phase9-baseline-app\'; DELETE FROM "User" WHERE id=\'phase9-baseline-user\';')
root.rmdir()
