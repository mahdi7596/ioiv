import json,pathlib,subprocess
root=pathlib.Path.cwd();e=root/'docs/security-remediation-2026-09-18/phase-11';info=json.loads((e/'environment.json').read_text());cid=info['containerId'];src=pathlib.Path(info['source']);env=json.loads((pathlib.Path(info['run'])/'env.json').read_text())
assert subprocess.check_output(['docker','inspect','--format','{{index .Config.Labels "sana.task"}}',cid],text=True).strip()==info['container']
with (e/'facilities-cli.log').open('w') as log:
 subprocess.run(['docker','exec','-i',cid,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],input=b'DROP DATABASE IF EXISTS phase11_facilities_cli; CREATE DATABASE phase11_facilities_cli TEMPLATE phase11_rehearsal;',stdout=log,stderr=subprocess.STDOUT,check=True)
 subprocess.run(['docker','exec','-i',cid,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','phase11_facilities_cli','-v','runtime_role=phase1_runtime'],input=(root/'prisma/facilities-runtime-role-grants.sql').read_bytes(),stdout=log,stderr=subprocess.STDOUT,check=True)
 from urllib.parse import urlsplit,urlunsplit
 for k in ['DATABASE_URL','PHASE1_OWNER_URL']:
  u=urlsplit(env[k]);env[k]=urlunsplit((u.scheme,u.netloc,'/phase11_facilities_cli',u.query,u.fragment))
 p=subprocess.run(['node','--import','tsx','prisma/tests/maintenance/facilities-cli.ts'],cwd=src,env=env,stdout=log,stderr=subprocess.STDOUT)
print('exit',p.returncode);print('\n'.join((e/'facilities-cli.log').read_text().splitlines()[-8:]));raise SystemExit(p.returncode)
