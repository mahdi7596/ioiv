import pathlib,json,subprocess,re,socket,os,tempfile,shutil
root=pathlib.Path('/Users/mahdi/Documents/work/ioiv');e=root/'docs/security-remediation-2026-09-18/phase-8';records=[json.loads((e/n).read_text()) for n in ['environment-draft.json','environment-pre-final-fix.json','environment.json']];result={'containers':[],'recordedPids':{},'ports':{},'removedSyntheticTestRoots':[]};ports=set();pids=set()
for p in e.glob('*.log'):
 s=p.read_text(errors='replace');pids.update(map(int,re.findall(r'"pid":\s*(\d+)',s)))
 for field in ['port','scannerPort']:ports.update(map(int,re.findall(r'"'+field+r'":\s*(\d+)',s)))
for i in records:
 info=json.loads(subprocess.check_output(['docker','inspect',i['containerId']],text=True))[0];assert info['Id']==i['containerId'] and info['Name']=='/'+i['container'] and info['Config']['Labels'].get('sana.task')==i['container'];ports.add(int(i['port']))
 result['containers'].append({'id':info['Id'],'name':i['container'],'label':i['label'],'image':info['Image'],'formerPort':i['port']})
 subprocess.run(['docker','rm','-f',info['Id']],check=True,stdout=subprocess.DEVNULL)
 assert subprocess.run(['docker','inspect',info['Id']],capture_output=True).returncode!=0
for pid in sorted(pids):
 try:os.kill(pid,0);status='present';cmd=subprocess.check_output(['ps','-p',str(pid),'-o','command='],text=True).strip()
 except ProcessLookupError:status='absent';cmd=''
 result['recordedPids'][str(pid)]={'status':status,**({'command':cmd} if cmd else {})}
 assert status=='absent',('recorded PID still present; inspect identity before any action',pid)
for port in sorted(ports):
 sock=socket.socket();sock.settimeout(.2);open_=sock.connect_ex(('127.0.0.1',port))==0;sock.close();result['ports'][str(port)]='open' if open_ else 'closed';assert not open_
# These uniquely prefixed roots are created solely by this phase's isolated test module.
parent=pathlib.Path(tempfile.gettempdir()).resolve()
for p in parent.glob('sana-phase8-files-*'):
 assert p.is_dir() and not p.is_symlink() and p.resolve().parent==parent
 shutil.rmtree(p);result['removedSyntheticTestRoots'].append(str(p))
result['sourceScratchRetained']=[i['run'] for i in records];result['otherResourcesTouched']=False
(e/'shutdown.json').write_text(json.dumps(result,indent=2));print({'ownedContainersRemoved':len(records),'recordedPidsAbsent':len(pids),'portsClosed':len(ports),'failedFixtureRootsRemoved':len(result['removedSyntheticTestRoots'])})
