"""Offline paired-pose target study, not a runtime installation.
Use the previously verified actual skinned meshes and keep hands outside support."""
import numpy as np,json,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
old=Path('docs/audits/BF_AVATAR_SHOULDER_TRANSITION_20261127')
out=Path('docs/audits/BF_AVATAR_POSE_CORRECTIVE_20261127')
meta=json.loads((old/'final-candidate.json').read_text(encoding='utf8'))
raw=Path('.bodyforge-qa/shoulder-transition-20261127/final-candidate.bin').read_bytes()
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

params=[
 (.10,1.12,.46,1,30,1,0),
 (.09,1.10,.51,1,35,1,0),
 (.10,1.16,.46,1.05,30,1.05,0),
 (.10,1.12,.48,1.05,35,1.12,0),
 (.10,1.12,.48,1.05,35,1.0,1.0),
 (.10,1.12,.48,1.05,35,.95,1.5),
 (.10,1.12,.48,1.0,35,1.1,1.0),
 (.10,1.12,.48,1.0,35,1.0,1.5),
 (.10,1.12,.48,1.15,35,1.1,1.5),
 (.10,1.12,.48,1.25,35,1.15,2.0),
]
# A smooth, localized normal offset for cloth only; no collision simulation.
def vertex_normals(p,f):
    tri=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]])
    a=np.zeros_like(p)
    for k in range(3):np.add.at(a,f[:,k],tri)
    return a/np.maximum(np.linalg.norm(a,axis=1)[:,None],1e-10)
# Weld shirt normals at exact coincident bind positions.
_,sf,si=np.unique(np.round(bind[1]*1e6).astype(np.int64),axis=0,return_index=True,return_inverse=True)
def shirt_normals(p):
    return vertex_normals(p[sf],si[faces[1]])[si]
report={}
for idx,par in enumerate(params):
    inner,lower,outer,strength,cap,cloth,mm=par
    rows={}
    for state,(n,w) in samples.items():
        if state=='reset':continue
        p=[a.copy() for a in n]
        for i in [0,1]:
            weight=field(bind[i],inner,lower,outer,strength if i==0 else cloth)
            delta=(w[i]-n[i])*weight[:,None]
            mag=np.linalg.norm(delta,axis=1)
            delta*=np.minimum(1,cap/1000/np.maximum(mag,1e-9))[:,None]
            p[i]+=delta
            if i==1 and mm:
                p[i]+=shirt_normals(p[i])*(mm/1000*field(bind[i],inner,lower,outer,1))[:,None]
        r=stats(p)
        r['peakBodyMm']=float(np.max(np.linalg.norm(p[0]-n[0],axis=1))*1000)
        rows[state]=r
    summary={k:sum(v[k] for v in rows.values()) for k in ['comp','severe','overlap','expandedComp','expandedOverlap','shirt2','shirt5']}
    summary['minDepth']=min(v['minDepth'] for v in rows.values())
    summary['peakBodyMm']=max(v['peakBodyMm'] for v in rows.values())
    report[str(idx)]={'parameters':par,'summary':summary,'states':rows}
    print(idx,json.dumps(summary),flush=True)
with (out/'local-target-refine.json').open('x',encoding='utf8') as f:json.dump(report,f,indent=2)
print('REFINE_PASS',flush=True)
