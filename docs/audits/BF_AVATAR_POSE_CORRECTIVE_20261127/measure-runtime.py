"""Offline paired-pose target study, not a runtime installation.
Use the previously verified actual skinned meshes and keep hands outside support."""
import numpy as np,json,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
old=Path('docs/audits/BF_AVATAR_POSE_CORRECTIVE_20261127')
out=Path('docs/audits/BF_AVATAR_POSE_CORRECTIVE_20261127')
meta=json.loads((old/'runtime.json').read_text(encoding='utf8'))
raw=Path('.bodyforge-qa/pose-corrective-20261127/runtime.bin').read_bytes()
assert len(raw)==meta['binaryBytes'] and hashlib.sha256(raw).hexdigest()==meta['binarySha256']
def arr(ref,dt):
    return np.frombuffer(raw,dtype=dt,count=ref['bytes']//4,offset=ref['offset']).reshape(-1,3)
base,wide=[meta['report'][k] for k in ['baseline','candidate']]
bind=[arr(s['bind'],'<f4') for s in base['stats']]
faces=[arr(s['indices'],'<u4') for s in base['stats']]
samples={k:([arr(r,'<f4') for r in v],[arr(r,'<f4') for r in wide['samples'][k]]) for k,v in base['samples'].items()}
def area(p,f):
    return np.linalg.norm(np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]]),axis=1)
c=bind[0][faces[0]].mean(axis=1)
roi=(abs(c[:,0])>=.10)&(abs(c[:,0])<=.34)&(c[:,1]>=1.25)&(c[:,1]<=1.49)&(area(bind[0],faces[0])>=1e-10)
rfaces=faces[0][roi];a0=area(bind[0],rfaces)
assert len(rfaces)==5994
expanded=(abs(c[:,0])>=.065)&(abs(c[:,0])<=.51)&(c[:,1]>=1.10)&(c[:,1]<=1.55)&(area(bind[0],faces[0])>=1e-10)
efaces=faces[0][expanded];ae=area(bind[0],efaces)
_,weld=np.unique(np.round(bind[0]*1e6).astype(np.int64),axis=0,return_inverse=True)
s=bind[1]
sel=(abs(s[:,0])>=.055)&(abs(s[:,0])<=.46)&(s[:,1]>=1.12)&(s[:,1]<=1.54)
def ramp(x,a,b):
    t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
def field(p,inner,lower,outer,strength):
    x=abs(p[:,0]);y=p[:,1];z=p[:,2]
    shoulder=ramp(x,inner,.175)*(1-ramp(x,.275,outer))*ramp(y,lower,1.31)*(1-ramp(y,1.48,1.54))
    collar=ramp(x,.055,.10)*(1-ramp(x,.20,.27))*ramp(y,1.40,1.46)*(1-ramp(y,1.50,1.54))
    return np.maximum(shoulder,collar)*strength
def bvh(p,f):
    return BVHTree.FromPolygons(p.tolist(),f.tolist(),all_triangles=True,epsilon=0)
def overlap(p,f):
    t=bvh(p,f)
    return sum(1 for a,b in t.overlap(t) if a<b and not set(weld[f[a]]).intersection(weld[f[b]]))
def depth(tree,p):
    d=[]
    for v in p:
        q,n,i,dist=tree.find_nearest(Vector(v))
        assert q is not None
        d.append(float((Vector(v)-q).dot(n))*1000)
    return np.array(d)
def stats(p):
    r=area(p[0],rfaces)/a0
    e=area(p[0],efaces)/ae
    d=depth(bvh(p[0],faces[0]),p[1][sel])
    l=depth(bvh(p[1],faces[1]),p[2])
    return dict(comp=int((r<.55).sum()),severe=int((r<.25).sum()),overlap=overlap(p[0],rfaces),expandedComp=int((e<.55).sum()),expandedOverlap=overlap(p[0],efaces),shirt2=int((d< -2).sum()),shirt5=int((d< -5).sum()),minDepth=float(d.min()),logoAbs=float(abs(l).max()))

report={}
for name,which in [('baseline',0),('candidate',1)]:
    rows={}
    for state,pair in samples.items():
        p=pair[which]
        r=stats(p)
        r['peakBodyMm']=float(np.max(np.linalg.norm(p[0]-pair[0][0],axis=1))*1000)
        rows[state]=r
    summary={k:sum(v[k] for n,v in rows.items() if n!='reset') for k in ['comp','severe','overlap','expandedComp','expandedOverlap','shirt2','shirt5']}
    summary['minDepth']=min(v['minDepth'] for v in rows.values())
    summary['peakBodyMm']=max(v['peakBodyMm'] for v in rows.values())
    report[name]={'summary':summary,'states':rows}
    print(name,json.dumps(summary),flush=True)
for k,v in report['candidate']['states'].items():
    u=report['baseline']['states'][k]
    print(k,'comp',u['comp'],v['comp'],'severe',u['severe'],v['severe'],'overlap',u['overlap'],v['overlap'],'expanded',u['expandedOverlap'],v['expandedOverlap'],'shirt5',u['shirt5'],v['shirt5'],'depth',round(v['minDepth'],3),flush=True)
with (out/'runtime-clearance.json').open('x',encoding='utf8') as f:json.dump(report,f,indent=2)
print('RUNTIME_GEOMETRY_MEASURED',flush=True)
