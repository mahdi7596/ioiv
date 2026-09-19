import json,pathlib,subprocess
root=pathlib.Path('/Users/mahdi/Documents/work/ioiv');e=root/'docs/security-remediation-2026-09-18/phase-9';info=json.loads((e/'environment.json').read_text());env=json.loads((pathlib.Path(info['run'])/'env.json').read_text()); env['DATABASE_URL']=env['PHASE1_OWNER_URL'];src=pathlib.Path(info['source'])
labels=json.loads(subprocess.check_output(['docker','inspect',info['containerId']],text=True))[0]['Config']['Labels']
assert labels.get('sana.task')==info['container']
assert env['DATABASE_URL'].startswith('postgresql://postgres:phase9_fixture@127.0.0.1:')
with (e/'migration-draft-v5.log').open('w') as log:
 subprocess.run([str(src/'node_modules/.bin/prisma'),'migrate','reset','--force','--skip-seed','--skip-generate'],cwd=src,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
 subprocess.run(['docker','exec','-i',info['containerId'],'psql','-v','ON_ERROR_STOP=1','-U','postgres','-d',info['database'],'-v','runtime_role='+info['role']],input=(root/'prisma/facilities-runtime-role-grants.sql').read_bytes(),stdout=log,stderr=subprocess.STDOUT,check=True)
print('migration applied and grants reprovisioned')
