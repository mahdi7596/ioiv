import json,pathlib,subprocess,os
p=pathlib.Path(__file__).resolve().parent;i=json.loads((p/'environment.json').read_text());env=json.loads((pathlib.Path(i['run'])/'env.json').read_text())
assert subprocess.check_output(['docker','inspect','--format','{{index .Config.Labels "sana.task"}}',i['containerId']],text=True).strip()==i['container']
records={}
expected_engine=subprocess.check_output(['node','-p','require("@prisma/engines-version").enginesVersion'],cwd=i['source'],text=True).strip()
for target in ['maintenance','runner']:
 image='sana-phase14-'+target+':local';meta=json.loads(subprocess.check_output(['docker','image','inspect',image],text=True))[0];assert meta['Config']['User']=='node';assert meta['Architecture']=='amd64';assert meta['Config']['Labels']['sana.task']=='phase14';image=meta['Id']
 check='''const fs=require('fs');const {PrismaClient,Prisma}=require('@prisma/client');if(process.getuid()===0)throw Error('root');const runtime=process.env.DATABASE_URL;const db=new PrismaClient();(async()=>{const q=await db.$queryRawUnsafe('SELECT current_user AS role, count(*)::int AS count FROM "User"');const result={uid:process.getuid(),node:process.version,openssl:process.versions.openssl,alpine:fs.readFileSync('/etc/alpine-release','utf8').trim(),prisma:Prisma.prismaVersion,role:q[0].role,cli:fs.existsSync('node_modules/prisma'),config:fs.existsSync('node_modules/@prisma/config'),exportTree:fs.existsSync('prisma-engine-export'),cliLink:fs.existsSync('node_modules/.bin/prisma')};if(result.exportTree)throw Error('obsolete export');if(Prisma.prismaVersion.client!=='6.19.3')throw Error('client mismatch');console.log(JSON.stringify(result));await db.$disconnect()})().catch(e=>{console.error(e.message);process.exitCode=1})'''
 url=env['DATABASE_URL'].replace('127.0.0.1','host.docker.internal')
 out=subprocess.check_output(['docker','run','--rm','--platform','linux/amd64','--label','sana.task=phase14','-e','DATABASE_URL='+url,'--entrypoint','node',image,'-e',check],text=True);data=json.loads(out);assert data['role']=='phase1_runtime';assert data['prisma']['engine']==expected_engine
 if target=='runner':assert not any(data[k] for k in ['cli','config','cliLink'])
 else:assert data['cli'] and data['config'] and data['cliLink']
 job=subprocess.run(['docker','run','--rm','--platform','linux/amd64','--label','sana.task=phase14','-e','DATABASE_URL='+url,'--entrypoint','node',image,'node_modules/tsx/dist/cli.mjs','scripts/prune-otp-codes.ts'],text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 (p/('image-'+target+'-otp-maintenance.log')).write_text(job.stdout);assert job.returncode==0,job.stdout
 assert 'otp_prune_completed' in job.stdout,job.stdout
 records[target]={'imageId':meta['Id'],'repoDigests':meta.get('RepoDigests'),'architecture':meta['Architecture'],'inspection':data}
 if target=='maintenance':
  for command in ['deploy','status']:
   out=subprocess.check_output(['docker','run','--rm','--platform','linux/amd64','--label','sana.task=phase14','-e','DATABASE_URL='+env['PHASE1_OWNER_URL'].replace('127.0.0.1','host.docker.internal'),image,'node_modules/.bin/prisma','migrate',command],text=True,stderr=subprocess.STDOUT);(p/('image-migrate-'+command+'.log')).write_text(out)
(p/'image-verification.json').write_text(json.dumps(records,indent=2)+'\n');print('both image UID/client/engine/query/CLI boundaries verified')
# Exercise the actual runner's production HTTP stack, not only a one-off Node process.
import time,urllib.request,urllib.error
cid=subprocess.check_output(['docker','run','-d','--platform','linux/amd64','--label','sana.task=phase14','-p','127.0.0.1::3000','-e','DATABASE_URL='+env['DATABASE_URL'].replace('127.0.0.1','host.docker.internal'),'-e','SESSION_SECRET='+env['SESSION_SECRET'],'-e','APP_URL=http://127.0.0.1:3000',records['runner']['imageId']],text=True).strip()
try:
 port=subprocess.check_output(['docker','port',cid,'3000/tcp'],text=True).strip().split(':')[-1];base='http://127.0.0.1:'+port
 deadline=time.monotonic()+60
 while True:
  try:
   with urllib.request.urlopen(base+'/api/health',timeout=3) as response:assert response.status==200 and json.load(response)=={'ok':True}
   break
  except (urllib.error.URLError,TimeoutError):
   assert time.monotonic()<deadline,'runner health unavailable';time.sleep(.5)
 try:urllib.request.urlopen(base+'/api/auth/logout',timeout=5);raise AssertionError('GETlogout accepted')
 except urllib.error.HTTPError as err:assert err.code==405
 request=urllib.request.Request(base+'/api/auth/logout',data=b'',method='POST',headers={'Origin':'https://hostile.invalid'})
 try:urllib.request.urlopen(request,timeout=5);raise AssertionError('foreign logout accepted')
 except urllib.error.HTTPError as err:assert err.code==403 and not err.headers.get('Set-Cookie')
 records['runner']['http']={'health200':True,'getLogout405':True,'foreignLogout403NoCookie':True,'port':port}
finally:
 assert subprocess.check_output(['docker','inspect','--format','{{index .Config.Labels "sana.task"}}',cid],text=True).strip()=='phase14'
 subprocess.run(['docker','rm','-f',cid],check=True,capture_output=True)
(p/'image-verification.json').write_text(json.dumps(records,indent=2)+'\n');print('actual runner health and protected HTTP routes passed; container removed')
