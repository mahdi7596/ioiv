import json,pathlib,subprocess
root=pathlib.Path.cwd(); e=root/'docs/security-remediation-2026-09-18/phase-11'; info=json.loads((e/'environment.json').read_text()); env=json.loads((pathlib.Path(info['run'])/'env.json').read_text()); src=pathlib.Path(info['source'])
with (e/'migration.log').open('w') as log:
 subprocess.run([str(src/'node_modules/.bin/prisma'),'migrate','deploy'],cwd=src,env={**env,'DATABASE_URL':env['PHASE1_OWNER_URL']},stdout=log,stderr=subprocess.STDOUT,check=True)
 subprocess.run(['docker','exec','-i',info['containerId'],'psql','-v','ON_ERROR_STOP=1','-U','postgres','-d','phase1','-v','runtime_role=phase1_runtime'],input=(root/'prisma/facilities-runtime-role-grants.sql').read_bytes(),stdout=log,stderr=subprocess.STDOUT,check=True)
print('isolated migration/grants passed')
