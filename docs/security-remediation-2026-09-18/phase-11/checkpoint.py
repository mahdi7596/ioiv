import json,pathlib,subprocess,hashlib
root=pathlib.Path.cwd();e=root/'docs/security-remediation-2026-09-18/phase-11';i=json.loads((e/'environment.json').read_text());src=pathlib.Path(i['source']);old=json.loads((e.parent/'phase-10/source-hashes.json').read_text())
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
paths=set(old)
for cmd in [['git','diff','--name-only','-z'],['git','ls-files','--others','--exclude-standard','-z']]:
 for name in subprocess.check_output(cmd,cwd=root).decode().split('\0'):
  if name and not name.startswith(('docs/','.codex/','.claude/')) and (root/name).is_file():paths.add(name)
source={name:digest(root/name) for name in sorted(paths)};tested={name:digest(src/name) for name in sorted(paths) if not name.startswith('.env')};assert all(source[k]==v for k,v in tested.items())
(e/'source-hashes.json').write_text(json.dumps(source,indent=2)+'\n');(e/'tested-source-hashes.json').write_text(json.dumps(tested,indent=2)+'\n')
changed=[p for p,h in old.items() if digest(root/p)!=h]
(e/'source-comparison.json').write_text(json.dumps({'sourceCount':len(source),'testedCount':len(tested),'mismatches':[],'changedFromPhase10':changed,'newFiles':sorted(paths-set(old)),'envFilesExcluded':True},indent=2)+'\n')
branch=subprocess.check_output(['git','branch','--show-current'],text=True).strip();head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip();audit=digest(root/'docs/2026-09-16-payment-upload-security-audit.md');assert branch=='master' and head=='29705da7e148b75a56d3a4aedc3565530c1d6974' and audit=='2c775286f74363868519d05f7af6886cf38f77454e4c7394d6f90def8716716e'
(e/'workspace-final.json').write_text(json.dumps({'branch':branch,'head':head,'preservedAuditSha256':audit,'sourceCount':len(source),'testedSourceCount':len(tested),'productionAccess':False,'commitPushReset':False},indent=2)+'\n')
assert subprocess.check_output(['docker','inspect','--format','{{index .Config.Labels "sana.task"}}',i['containerId']],text=True).strip()==i['container']
sql='''SELECT json_build_object('migrations',(SELECT json_object_agg(migration_name,checksum) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),'enabledFacilities',(SELECT count(*) FROM "FacilitiesProgramConfiguration" WHERE "isEnabled"),'runtimeSuperuser',(SELECT rolsuper FROM pg_roles WHERE rolname='phase1_runtime'),'legacyDelete',has_table_privilege('phase1_runtime','"ApplicationFile"','DELETE'),'verificationUpdate',has_table_privilege('phase1_runtime','"LegacyFileVerification"','UPDATE'),'verificationDelete',has_table_privilege('phase1_runtime','"LegacyFileVerification"','DELETE'),'snapshotDelete',has_table_privilege('phase1_runtime','"FacilitiesApplicationShareholder"','DELETE'));'''
r=subprocess.check_output(['docker','exec','-i',i['containerId'],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','phase1'],input=sql,text=True);data=json.loads(r);assert len(data['migrations'])==34
for name,h in data['migrations'].items():assert digest(root/'prisma/migrations'/name/'migration.sql')==h
assert data['enabledFacilities']==0 and not any(data[k] for k in ['runtimeSuperuser','legacyDelete','verificationUpdate','verificationDelete','snapshotDelete'])
(e/'database-final.json').write_text(json.dumps(data,indent=2)+'\n');print(json.dumps({'source':len(source),'tested':len(tested),'migrations':len(data['migrations']),'baselinePreserved':True}))
