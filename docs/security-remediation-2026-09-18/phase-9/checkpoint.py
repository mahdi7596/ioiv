import json,pathlib,subprocess,hashlib,re
root=pathlib.Path('/Users/mahdi/Documents/work/ioiv');e=root/'docs/security-remediation-2026-09-18/phase-9';i=json.loads((e/'environment.json').read_text());src=pathlib.Path(i['source']);old=json.loads((e.parent/'phase-8/source-hashes.json').read_text())
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
paths=set(old)
for command in [['git','diff','--name-only','-z'],['git','ls-files','--others','--exclude-standard','-z']]:
 for name in subprocess.check_output(command,cwd=root).decode().split('\0'):
  if name and not name.startswith(('docs/','.codex/','.claude/')) and (root/name).is_file():paths.add(name)
source={name:digest(root/name) for name in sorted(paths)}
tested={name:digest(src/name) for name in sorted(paths) if not name.startswith('.env')}
assert all(source[k]==v for k,v in tested.items())
(e/'source-hashes.json').write_text(json.dumps(source,indent=2)+'\n');(e/'tested-source-hashes.json').write_text(json.dumps(tested,indent=2)+'\n')
changed=[p for p,h in old.items() if digest(root/p)!=h];added=sorted(paths-set(old))
(e/'phase9-changed-files.json').write_text(json.dumps({'changedFromPhase8Checkpoint':changed,'additionalSourceFilesFingerprinted':added,'note':'Additional includes Phase9 files and supporting previously tracked source not in prior selective manifest.'},indent=2)+'\n')
protected=json.loads((e.parent/'phase-8/prior-source-preservation.json').read_text())['unchangedProtectedRuntimeFiles'];unchanged=[p for p in protected if digest(root/p)==old[p]]
assert set(protected)-set(unchanged)=={'lib/actions/payment.ts'}
(e/'prior-source-preservation.json').write_text(json.dumps({'priorCheckpointCount':len(old),'unchangedProtectedRuntimeFiles':unchanged,'intentionalProtectedChanges':{'lib/actions/payment.ts':'R8 current-reference/version validation under existing payment lock, original array positions, safe conflict response; gateway/settlement/coordination unchanged and regressions requalified.'},'changedFromPhase8Checkpoint':changed},indent=2)+'\n')
branch=subprocess.check_output(['git','branch','--show-current'],cwd=root,text=True).strip();head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip();audit=digest(root/'docs/2026-09-16-payment-upload-security-audit.md')
assert branch=='master' and head=='29705da7e148b75a56d3a4aedc3565530c1d6974' and audit=='2c775286f74363868519d05f7af6886cf38f77454e4c7394d6f90def8716716e'
(e/'workspace-final.json').write_text(json.dumps({'branch':branch,'head':head,'preservedAuditSha256':audit,'sourceCount':len(source),'testedSourceCount':len(tested),'copiedSourcesMatch':True,'envFilesExcluded':True,'productionAccess':False,'commitPushOrReset':False},indent=2)+'\n')
labels=json.loads(subprocess.check_output(['docker','inspect',i['containerId']],text=True))[0]['Config']['Labels'];assert labels.get('sana.task')==i['container']
sql='''SELECT json_build_object('migrationCount',(SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),'migrationChecksum',(SELECT checksum FROM "_prisma_migrations" WHERE migration_name='20260919150000_legacy_file_bindings'),'enabledFacilities',(SELECT count(*) FROM "FacilitiesProgramConfiguration" WHERE program='FACILITIES' AND "isEnabled"=true),'runtimeSuperuser',(SELECT rolsuper FROM pg_roles WHERE rolname='phase1_runtime'),'legacyFileDeleteAllowed',has_table_privilege('phase1_runtime','"ApplicationFile"','DELETE'),'candidateCount',(SELECT count(*) FROM "LegacyUploadCandidate"),'bindingCount',(SELECT count(*) FROM "LegacyFileBinding"),'intentCount',(SELECT count(*) FROM "LegacyFileDeletionIntent"));'''
r=subprocess.check_output(['docker','exec','-i',i['containerId'],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','phase1'],input=sql,text=True);data=json.loads(r);assert data['migrationCount']==31 and data['migrationChecksum']==digest(root/'prisma/migrations/20260919150000_legacy_file_bindings/migration.sql') and data['enabledFacilities']==0 and not data['runtimeSuperuser'] and not data['legacyFileDeleteAllowed'];(e/'database-final.json').write_text(json.dumps(data,indent=2)+'\n')
(e/'source-comparison.json').write_text(json.dumps({'sourceCount':len(source),'copiedCount':len(tested),'mismatches':[],'staticExcluded':['.env.runtime.example']},indent=2)+'\n')
print(json.dumps({'source':len(source),'tested':len(tested),'protectedUnchanged':len(unchanged),'migration':data['migrationChecksum']}))
