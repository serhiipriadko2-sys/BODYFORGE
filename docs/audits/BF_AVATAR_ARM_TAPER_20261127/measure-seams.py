import numpy as np, json, hashlib
from pathlib import Path
from mathutils.kdtree import KDTree
p=Path('docs/audits/BF_AVATAR_ARM_TAPER_20261127')
meta=json.loads((p/'runtime.json').read_text(encoding='utf8'))
raw=Path('.bodyforge-qa/arm-taper-20261127/runtime.bin').read_bytes()
assert len(raw)==meta['binaryBytes'] and hashlib.sha256(raw).hexdigest()==meta['binarySha256']
def a(ref):
    return np.frombuffer(raw,dtype='<f4',count=ref['bytes']//4,offset=ref['offset']).reshape(-1,3)
base=meta['report']['baseline'];candidate=meta['report']['candidate']
bind=[a(s['bind']) for s in base['stats']]
pairs=[]
for i in [0,1]:
    _,first,inv=np.unique(np.round(bind[i]*1e6).astype(np.int64),axis=0,return_index=True,return_inverse=True)
    rep=first[inv]
    idx=np.flatnonzero(rep!=np.arange(len(rep)))
    pairs.append((idx,rep[idx]))
tree=KDTree(len(bind[0]))
for i,v in enumerate(bind[0]):tree.insert(v,i)
tree.balance()
nipples=[]
for i,v in enumerate(bind[3]):
    _,j,d=tree.find(v)
    if d<1.1e-6:nipples.append((j,i))
assert nipples, 'No common body/nipple rim anchors'
nipples=np.asarray(nipples,dtype=np.int64)
rows={}
for key,refs in base['samples'].items():
    b=[a(r) for r in refs]
    c=[a(r) for r in candidate['samples'][key]]
    row={}
    for i,name in [(0,'body'),(1,'shirt')]:
        u,v=pairs[i]
        old=np.linalg.norm(b[i][u]-b[i][v],axis=1)*1000
        new=np.linalg.norm(c[i][u]-c[i][v],axis=1)*1000
        # Differential gap rather than absolute pre-existing split.
        inc=np.max(new-old)
        row[name]={'pairedDuplicates':len(u),'baselineMaxMm':float(old.max()),'candidateMaxMm':float(new.max()),'maxIncreaseMm':float(inc)}
    u,v=nipples.T
    old=np.linalg.norm(b[0][u]-b[3][v],axis=1)*1000
    new=np.linalg.norm(c[0][u]-c[3][v],axis=1)*1000
    row['nippleRim']={'anchors':len(nipples),'baselineMaxMm':float(old.max()),'candidateMaxMm':float(new.max()),'maxIncreaseMm':float((new-old).max())}
    rows[key]=row
summary={k:{'maxIncreaseMm':max(r[k]['maxIncreaseMm'] for r in rows.values()),'candidateMaxMm':max(r[k]['candidateMaxMm'] for r in rows.values())} for k in ['body','shirt','nippleRim']}
print('SEAM_MEASUREMENT',json.dumps(summary),flush=True)
with (p/'seam-clearance.json').open('x',encoding='utf8') as f:json.dump({'summary':summary,'states':rows},f,indent=2)
