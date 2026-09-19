import os, pathlib, tempfile, subprocess, json, shutil
root=pathlib.Path.cwd(); evidence=root/'docs/security-remediation-2026-09-18/phase-5'; run=pathlib.Path(tempfile.mkdtemp(prefix='sana-phase5-')); src=run/'source'; src.mkdir()
subprocess.run(['rsync','-a','--exclude=node_modules','--exclude=.git','--exclude=.next','--exclude=.env*','--exclude=docs/security-remediation-2026-09-18','./',str(src)+'/'],check=True)
subprocess.run(['cp','-cR',str(root/'node_modules'),str(src/'node_modules')],check=True)
name='sana-phase5-'+run.name.split('-')[-1]; label='sana.task='+name
cid=subprocess.check_output(['docker','run','-d','--name',name,'--label',label,'-e','POSTGRES_PASSWORD=phase5_fixture','-e','POSTGRES_DB=phase1','-p','127.0.0.1::5432','postgres:16'],text=True).strip()
port=subprocess.check_output(['docker','port',cid,'5432/tcp'],text=True).strip().split(':')[-1]
env={k:os.environ[k] for k in ['PATH','HOME','TMPDIR'] if k in os.environ}
env.update(DATABASE_URL=f'postgresql://phase1_runtime:phase5_runtime@127.0.0.1:{port}/phase1',PHASE1_OWNER_URL=f'postgresql://postgres:phase5_fixture@127.0.0.1:{port}/phase1',PHASE1_ISOLATED_DB='true',ZARINPAL_SANDBOX='true',ZARINPAL_MERCHANT_ID='',SMS_API_KEY='',SESSION_SECRET='phase5-isolated-synthetic-secret-20260919',OTP_VERIFY_LIMIT_SECRET='phase5-only-protected-limiter-secret-20260919',OTP_VERIFY_TRUST_PROXY='false',GHASEDAK_API_KEY='',SMS_SEND_IN_DEVELOPMENT='false',APP_URL='http://127.0.0.1:3293',UPLOAD_DIR=str(run/'uploads'),GIT_DIR=str(root/'.git'),GIT_WORK_TREE=str(root),NEXT_TELEMETRY_DISABLED='1')
(run/'env.json').write_text(json.dumps(env)); (evidence/'environment.json').write_text(json.dumps(dict(run=str(run),source=str(src),container=name,containerId=cid,label=label,port=port,database='phase1',role='phase1_runtime'),indent=2))
print(run,flush=True)
subprocess.run(['docker','exec',cid,'sh','-c','until pg_isready -U postgres; do sleep 1; done'],check=True,stdout=subprocess.DEVNULL)
with (evidence/'setup.log').open('w') as log:
 subprocess.run([str(src/'node_modules/.bin/prisma'),'migrate','deploy'],cwd=src,env={**env,'DATABASE_URL':env['PHASE1_OWNER_URL']},stdout=log,stderr=subprocess.STDOUT,check=True)
 subprocess.run(['docker','exec',cid,'psql','-U','postgres','-d','phase1','-c',"CREATE ROLE phase1_runtime LOGIN PASSWORD 'phase5_runtime' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT"],stdout=log,stderr=subprocess.STDOUT,check=True)
 subprocess.run(['docker','exec','-i',cid,'psql','-v','ON_ERROR_STOP=1','-U','postgres','-d','phase1','-v','runtime_role=phase1_runtime'],input=(root/'prisma/facilities-runtime-role-grants.sql').read_bytes(),stdout=log,stderr=subprocess.STDOUT,check=True)
print('setup complete')
