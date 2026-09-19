import json,pathlib,subprocess,sys
root=pathlib.Path('/Users/mahdi/Documents/work/ioiv'); e=root/'docs/security-remediation-2026-09-18/phase-3'; info=json.loads((e/'environment.json').read_text()); src=pathlib.Path(info['source']); env=json.loads((pathlib.Path(info['run'])/'env.json').read_text())
if sys.argv[1]=='sync':
 subprocess.run(['rsync','-a','--exclude=node_modules','--exclude=.git','--exclude=.next','--exclude=.env*','--exclude=docs/security-remediation-2026-09-18',str(root)+'/',str(src)+'/'],check=True); sys.exit()
with (e/sys.argv[1]).open('w') as out:
 p=subprocess.run(sys.argv[2:],cwd=src,env=env,stdout=out,stderr=subprocess.STDOUT)
print('exit',p.returncode); print('\n'.join((e/sys.argv[1]).read_text().splitlines()[-18:])); sys.exit(p.returncode)
