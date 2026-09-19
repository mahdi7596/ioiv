import json,pathlib,subprocess
root=pathlib.Path.cwd();e=root/'docs/security-remediation-2026-09-18/phase-4';info=json.loads((e/'environment.json').read_text());src=pathlib.Path(info['source']);env=json.loads((pathlib.Path(info['run'])/'env.json').read_text());env['DATABASE_URL']=env['PHASE1_OWNER_URL'];env['M1_RUNTIME_TEST_ROLE']='phase4_disposable_role'
with (e/'runtime-role.log').open('w') as log:
 r=subprocess.run(['sh','prisma/tests/test-facilities-runtime-role.sh'],cwd=src,env=env,stdout=log,stderr=subprocess.STDOUT)
print('role regression exit',r.returncode);raise SystemExit(r.returncode)
