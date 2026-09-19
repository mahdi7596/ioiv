"""Archive Phase7 exact source and evidence; never runs production or stops unknown PIDs."""
import pathlib,json,hashlib,subprocess
root=pathlib.Path.cwd();e=root/'docs/security-remediation-2026-09-18/phase-7';info=json.loads((e/'environment.json').read_text());src=pathlib.Path(info['source'])
hashes=json.loads((e.parent/'phase-6/source-hashes.json').read_text())
files=set(hashes)|{'lib/auth/admin-response.ts','lib/sms/timeout.ts','tests/admin-enumeration.db.test.ts','tests/admin-response.test.ts','prisma/tests/admin-enumeration/browser.ts','vitest.config.ts'}
new={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in sorted(files)}
bad=[p for p,v in new.items() if p!='.env.runtime.example' and (not(src/p).exists() or hashlib.sha256((src/p).read_bytes()).hexdigest()!=v)]
(e/'source-hashes.json').write_text(json.dumps(new,indent=2));(e/'source-comparison.json').write_text(json.dumps({'restartHashes':len(new),'testedCopyMatch':len(new)-1-len(bad),'staticallyReviewedOnly':['.env.runtime.example'],'mismatches':bad},indent=2))
(e/'phase7-changed-files.json').write_text(json.dumps([p for p,v in new.items() if hashes.get(p)!=v],indent=2))
(e/'workspace-status.txt').write_text(subprocess.check_output(['git','status','--short'],text=True))
assert not bad,bad
print('source hashes verified',len(new))
