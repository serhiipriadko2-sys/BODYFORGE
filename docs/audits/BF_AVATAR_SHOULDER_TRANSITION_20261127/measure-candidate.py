import bpy, hashlib, json
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

audit=Path('docs/audits/BF_AVATAR_SHOULDER_TRANSITION_20261127')
meta=json.loads((audit/'candidate.json').read_text(encoding='utf-8'))
raw=Path('.bodyforge-qa/shoulder-transition-20261127/candidate.bin').read_bytes()
assert len(raw)==meta['binaryBytes'] and hashlib.sha256(raw).hexdigest()==meta['binarySha256']
def arr(ref,dtype):
    return np.frombuffer(raw,dtype=dtype,count=ref['bytes']//4,offset=ref['offset']).reshape(-1,3)
def areas(p,f):
    return np.linalg.norm(np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]]),axis=1)
def bvh(p,f):
    return BVHTree.FromPolygons(p.tolist(),f.tolist(),all_triangles=True,epsilon=0)
def clearance(tree,p):
    d=[]
    for v in p:
        q,n,i,dist=tree.find_nearest(Vector(v))
        assert q is not None
        d.append(float((Vector(v)-q).dot(n))*1000)
    return np.array(d)
def signed_stats(d):
    return dict(count=len(d),belowMinus2mm=int(np.sum(d< -2)),belowMinus5mm=int(np.sum(d< -5)),minMm=float(np.min(d)),p05Mm=float(np.quantile(d,.05)),medianMm=float(np.median(d)))
def collisions(p,f,weld):
    tree=bvh(p,f)
    pairs=tree.overlap(tree)
    # exclude triangles sharing any vertex in the welded bind topology
    return sum(1 for a,b in pairs if a<b and not set(weld[f[a]]).intersection(weld[f[b]]))
def measure(mode,data):
    bind=[arr(x['bind'],'<f4') for x in data['stats']]
    faces=[arr(x['indices'],'<u4') for x in data['stats']]
    c=bind[0][faces[0]].mean(axis=1)
    roi=(np.abs(c[:,0])>=.10)&(np.abs(c[:,0])<=.34)&(c[:,1]>=1.25)&(c[:,1]<=1.49)
    roi=roi&(areas(bind[0],faces[0])>=1e-10)
    shoulder=faces[0][roi]
    a0=areas(bind[0],shoulder)
    _,weld=np.unique(np.round(bind[0]*1e6).astype(np.int64),axis=0,return_inverse=True)
    s=bind[1]
    sel=(np.abs(s[:,0])>=.055)&(np.abs(s[:,0])<=.39)&(s[:,1]>=1.22)&(s[:,1]<=1.54)
    result={}
    for name,refs in data['samples'].items():
        p=[arr(r,'<f4') for r in refs]
        ratio=areas(p[0],shoulder)/a0
        body=bvh(p[0],faces[0])
        shirt=bvh(p[1],faces[1])
        cd=clearance(body,p[1][sel]);ld=clearance(shirt,p[2])
        result[name]=dict(triangles=len(shoulder),compressed=int(np.sum(ratio<.55)),severe=int(np.sum(ratio<.25)),worst=float(np.min(ratio)),p01=float(np.quantile(ratio,.01)),selfOverlapPairs=collisions(p[0],shoulder,weld),shirt=signed_stats(cd),logo=signed_stats(ld),logoMaxAbsMm=float(np.max(np.abs(ld))))
    reset=[float(np.max(np.abs(arr(a,'<f4')-arr(b,'<f4')))) for a,b in zip(data['samples']['neutral'],data['samples']['reset'])]
    return dict(samples=result,resetMaxDisplacementsM=reset)
res={m:measure(m,v) for m,v in meta['report'].items()}
out=audit/'candidate-clearance.json'
with out.open('x',encoding='utf-8') as f:json.dump(res,f,indent=2)
for m,v in res.items():
    print(m,'reset',v['resetMaxDisplacementsM'])
    for n,r in v['samples'].items():
        print(n,r['compressed'],r['severe'],r['selfOverlapPairs'],r['shirt']['belowMinus2mm'],r['shirt']['belowMinus5mm'],round(r['shirt']['minMm'],2),round(r['logoMaxAbsMm'],2))
print('CANDIDATE_MEASURED',str(out))
