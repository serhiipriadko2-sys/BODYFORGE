from pathlib import Path
import json,hashlib,shutil
r=Path.cwd();a=r/'docs/audits/BF_107_MIXED_WRITER_20261125';c=r/'.bodyforge-qa/bf107-mixed-writer';d=r/'.bodyforge-qa/bf107-mixed-writer-control'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
source=json.loads((a/'source.json').read_text(encoding='utf-8-sig'))
owned=json.loads((a/'owned.json').read_text())
assert not d.exists()
d.mkdir()
rows=[]
for row in source:
 rel=row['path'];src=c/rel
 assert sha(src)==row['sha256'],rel
 target=d/rel;target.parent.mkdir(parents=True,exist_ok=True)
 if rel in owned:
  before=a/(Path(rel).name+'.before')
  assert sha(src)==owned[rel]
  shutil.copyfile(before,target)
 else:shutil.copyfile(src,target)
 rows.append({'path':rel,'bytes':target.stat().st_size,'sha256':sha(target)})
for row in rows:
 assert sha(d/row['path'])==row['sha256']
changed=[x['path'] for x,y in zip(rows,source) if x['sha256']!=y['sha256']]
assert set(changed)==set(owned),changed
with (a/'control-source.json').open('x',encoding='utf-8') as f:json.dump(rows,f,indent=2)
print('CONTROL_INPUTS',len(rows),'DIFFER_ONLY',changed,flush=True)