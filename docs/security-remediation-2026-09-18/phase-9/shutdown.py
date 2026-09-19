import pathlib,json,subprocess,re,socket,os
root=pathlib.Path('/Users/mahdi/Documents/work/ioiv');e=root/'docs/security-remediation-2026-09-18/phase-9';records=[json.loads((e/n).read_text()) for n in ['environment-draft.json','environment.json']];result={'containers':[],'recordedPids':{},'ports':{}};ports=set();pids=set()
for p in e.glob('*.log'):
 s=p.read_text(errors='replace');pids.update(map(int,re.findall(r'"pid":\s*(\d+)',s)))
 for field in ['port','scannerPort']:ports.update(map(int,re.findall(r'"'+field+r'":\s*(\d+)',s)))
for i in records:
 info=json.loads(subprocess.check_output(['docker','inspect',i['containerId']],text=True))[0];assert info['Id']==i['containerId'] and info['Name']=='/'+i['container'] and info['Config']['Labels'].get('sana.task')==i['container'];ports.add(int(i['port']))
 result['containers'].append({'id':info['Id'],'name':i['container'],'label':i['label'],'image':info['Image'],'formerPort':i['port']})
 subprocess.run(['docker','rm','-f',info['Id']],check=True,stdout=subprocess.DEVNULL)
 assert subprocess.run(['docker','inspect',info['Id']],capture_output=True).returncode!=0
for pid in sorted(pids):
 try:os.kill(pid,0);status='present'
 except ProcessLookupError:status='absent'
 result['recordedPids'][str(pid)]=status;assert status=='absent',('inspect identity before any action',pid)
for port in sorted(ports):
 sock=socket.socket();sock.settimeout(.2);open_=sock.connect_ex(('127.0.0.1',port))==0;sock.close();result['ports'][str(port)]='open' if open_ else 'closed';assert not open_
# Every process-death test awaits the killed worker's exit. Also inspect any process
# whose command contains a phase-specific worker/source path; never kill by broad name.
processes=subprocess.check_output(['ps','-axo','pid=,command='],text=True).splitlines()
owned=[line for line in processes if ('prisma/tests/legacy-replacement/crash-worker.ts' in line or any(i['source'] in line for i in records)) and 'shutdown.py' not in line]
assert not owned,owned
result['phaseWorkersRemaining']=[];result['sourceScratchAndSyntheticBytesRetained']=[i['run'] for i in records];result['otherResourcesTouched']=False
(e/'shutdown.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'ownedContainersRemoved':len(records),'recordedPidsAbsent':len(pids),'portsClosed':len(ports),'phaseWorkersRemaining':0}))
