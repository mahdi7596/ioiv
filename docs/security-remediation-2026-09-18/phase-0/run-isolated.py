import os,json,pathlib,subprocess,sys
r=pathlib.Path(__file__).parent
e=json.loads((r/"env.json").read_text())
sys.exit(subprocess.call(sys.argv[1:],cwd=r/"source",env=e))
