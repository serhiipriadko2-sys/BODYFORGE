import numpy as np,json,hashlib
from pathlib import Path
audit=Path('docs/audits/BF_AVATAR_SHOULDER_TRANSITION_20261127')
folder=Path('.bodyforge-qa/shoulder-transition-20261127')
meta=json.loads((audit/'diagnostic.json').read_text(encoding='utf8'));b=(folder/'diagnostic.bin').read_bytes()
assert hashlib.sha256(b).hexdigest()==meta['binarySha256']
n=meta['vertices'];ni=meta['indices']
p=np.frombuffer(b,dtype='<f4',offset=ni*4).reshape(-1,n,3)
bind=p[0]
_,first,inv,counts=np.unique(np.rint(bind.astype(np.float64)*1e6).astype(np.int64),axis=0,return_index=True,return_inverse=True,return_counts=True)
mask=(np.abs(bind[:,0])>.065)&(np.abs(bind[:,0])<.36)&(bind[:,1]>1.24)&(bind[:,1]<1.55)
r=[]
for k,name in enumerate(meta['states']):
    distance=np.linalg.norm(p[k]-p[k,first][inv],axis=1)*1000
    worst=np.argsort(distance*mask)[-8:][::-1]
    row=dict(state=name,duplicates=int((counts-1).sum()),maxSplitMm=float(distance.max()),shoulderMaxSplitMm=float(distance[mask].max()),shoulderAbove01mm=int((mask&(distance>.1)).sum()),
             worst=[dict(index=int(i),deltaMm=float(distance[i]),bind=bind[i].tolist()) for i in worst])
    r.append(row);print(json.dumps(row),flush=True)
with (audit/'split-diagnostics.json').open('x',encoding='utf8') as fp:json.dump(r,fp,indent=2)
