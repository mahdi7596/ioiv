import pathlib,json,subprocess,datetime
p=pathlib.Path(__file__).resolve().parent;i=json.loads((p/'environment.json').read_text());r=pathlib.Path(i['run']);records=json.loads((p/'image-verification.json').read_text());results={}
for target in ['runner','maintenance']:
 image=records[target]['imageId'];assert subprocess.check_output(['docker','image','inspect','--format','{{.Id}}',image],text=True).strip()==image
 with (p/('trivy-'+target+'.log')).open('w') as out:
  ret=subprocess.run([str(r/'trivy'),'image','--image-src','docker','--scanners','vuln','--cache-dir',str(r/'trivy-cache'),'--skip-db-update','--timeout','10m','--format','json','--output',str(p/('trivy-'+target+'.json')),image],stdout=out,stderr=subprocess.STDOUT)
 results[target]={'imageId':image,'exitCode':ret.returncode,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 if ret.returncode==0:
  report=json.loads((p/('trivy-'+target+'.json')).read_text());results[target]['findings']=[{'target':result['Target'],'class':result.get('Class'),'type':result.get('Type'),'vulnerabilities':len(result.get('Vulnerabilities') or []),'highCritical':sum(v['Severity'] in ['HIGH','CRITICAL'] for v in result.get('Vulnerabilities') or [])} for result in report.get('Results',[])]
metadata=r/'trivy-cache/db/metadata.json';results['database']=json.loads(metadata.read_text()) if metadata.exists() else None
(p/'image-scan-summary.json').write_text(json.dumps(results,indent=2)+'\n');assert all(results[t]['exitCode']==0 for t in ['runner','maintenance']);print(json.dumps(results))
