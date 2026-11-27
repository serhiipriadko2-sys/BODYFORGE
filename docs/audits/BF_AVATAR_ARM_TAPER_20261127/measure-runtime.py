"""Paired actual-runtime geometry. Test axial attenuation of existing corrective.
Not an anatomical ground truth or collision simulation."""
import json,hashlib
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
old=Path('docs/audits/BF_AVATAR_POSE_CORRECTIVE_20261127')
out=Path('docs/audits/BF_AVATAR_ARM_TAPER_20261127')
meta=json.loads((old/'runtime.json').read_text(encoding='utf8'))
raw=Path('.bodyforge-qa/pose-corrective-20261127/runtime.bin').read_bytes()
assert len(raw)==meta['binaryBytes'] and hashlib.sha256(raw).hexdigest()==meta['binarySha256']
def arr(ref,dt):
    return np.frombuffer(raw,dtype=dt,count=ref['bytes']//4,offset=ref['offset']).reshape(-1,3)
base,prev=[meta['report'][k] for k in ['baseline','candidate']]
bind=[arr(s['bind'],'<f4') for s in base['stats']]
faces=[arr(s['indices'],'<u4') for s in base['stats']]
samples={k:([arr(r,'<f4') for r in v],[arr(r,'<f4') for r in prev['samples'][k]]) for k,v in base['samples'].items()}
# Actual skeleton left-side endpoints, reflected for right; metres in bind space.
start=np.array([.203572626546,1.428929295450,.018598292131])
end=np.array([.373587820345,1.231889056948,.017157847749])
axis=end-start
def longitudinal(p):
    q=p.astype(np.float64).copy();q[:,0]=abs(q[:,0]);q-=start
    t=q@axis/(axis@axis)
    r=np.linalg.norm(q-t[:,None]*axis,axis=1)
    return t,r
def ramp(v,a,b):
    t=np.clip((v-a)/(b-a),0,1);return t**3*(10+t*(-15+6*t))
def gate(p,a,b,amount):
    t,r=longitudinal(p)
    # Restrict distal suppression to limb, not thorax.
    limb=ramp(abs(p[:,0]),.21,.29)
    return 1-amount*limb*ramp(t,a,b)
def area(p,f):
    return np.linalg.norm(np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]]),axis=1)
c=bind[0][faces[0]].mean(axis=1)
a0=area(bind[0],faces[0])
roi=(abs(c[:,0])>=.10)&(abs(c[:,0])<=.34)&(c[:,1]>=1.25)&(c[:,1]<=1.49)&(a0>=1e-10)
expanded=(abs(c[:,0])>=.065)&(abs(c[:,0])<=.51)&(c[:,1]>=1.10)&(c[:,1]<=1.55)&(a0>=1e-10)
ct,cr=longitudinal(c)
elbow=(abs(c[:,0])>.27)&(ct>=.65)&(ct<=1.35)&(cr<.13)&(a0>=1e-10)
_,first,weld=np.unique(np.round(bind[0]*1e6).astype(np.int64),axis=0,return_index=True,return_inverse=True)
t,r=longitudinal(bind[0]);ring=(abs(bind[0][:,0])>.29)&(t>=.70)&(t<=1.20)&(r<.12)
ring=first[ring[first]]
assert len(ring)>200
s=bind[1]
sel=(abs(s[:,0])>=.055)&(abs(s[:,0])<=.46)&(s[:,1]>=1.12)&(s[:,1]<=1.54)
def bvh(p,f):
    return BVHTree.FromPolygons(p.tolist(),f.tolist(),all_triangles=True,epsilon=0)
def overlap(p,f):
    tree=bvh(p,f)
    return sum(1 for a,b in tree.overlap(tree) if a<b and not set(weld[f[a]]).intersection(weld[f[b]]))
def depth(tree,p):
    d=[]
    for v in p:
        q,n,i,dist=tree.find_nearest(Vector(v))
        assert q is not None
        d.append(float((Vector(v)-q).dot(n))*1000)
    return np.array(d)
def stats(p,original):
    ratio=area(p[0],faces[0])/np.maximum(a0,1e-12)
    d=depth(bvh(p[0],faces[0]),p[1][sel])
    l=depth(bvh(p[1],faces[1]),p[2])
    displacement=np.linalg.norm(p[0][ring]-original[0][ring],axis=1)*1000
    return dict(comp=int((ratio[roi]<.55).sum()),severe=int((ratio[roi]<.25).sum()),
        expandedComp=int((ratio[expanded]<.55).sum()),expandedOverlap=overlap(p[0],faces[0][expanded]),
        elbowComp=int((ratio[elbow]<.55).sum()),elbowSevere=int((ratio[elbow]<.25).sum()),
        elbowP05=float(np.percentile(ratio[elbow],5)),elbowOverlap=overlap(p[0],faces[0][elbow]),
        shirt2=int((d< -2).sum()),shirt5=int((d< -5).sum()),minDepth=float(d.min()),
        logoAbs=float(abs(l).max()),distalRms=float(np.sqrt(np.mean(displacement**2))),distalMax=float(displacement.max()))

newmeta=json.loads((out/'runtime.json').read_text(encoding='utf8'))
newraw=Path('.bodyforge-qa/arm-taper-20261127/runtime.bin').read_bytes()
assert len(newraw)==newmeta['binaryBytes'] and hashlib.sha256(newraw).hexdigest()==newmeta['binarySha256']
def newarr(ref,dt):
    return np.frombuffer(newraw,dtype=dt,count=ref['bytes']//4,offset=ref['offset']).reshape(-1,3)
for i,st in enumerate(newmeta['report']['baseline']['stats']):
    assert np.array_equal(newarr(st['bind'],'<f4'),bind[i])
    assert np.array_equal(newarr(st['indices'],'<u4'),faces[i])
for key,(n,v) in samples.items():
    for i,ref in enumerate(newmeta['report']['baseline']['samples'][key]):
        assert np.array_equal(newarr(ref,'<f4'),n[i]),(key,i)
report={}
for name in ['narrow','v1','v2']:
    rows={}
    for state,(n,v) in samples.items():
        p=n if name=='narrow' else v if name=='v1' else [newarr(r,'<f4') for r in newmeta['report']['candidate']['samples'][state]]
        rows[state]=stats(p,n)
        if name=='v2':
            expected=[n[i]+(v[i]-n[i])*gate(bind[i],.5,1.10,1)[:,None] if i<2 else n[i] for i in range(len(n))]
            rows[state]['predictionMaxErrorMm']=max(float(np.max(np.linalg.norm(x-y,axis=1))*1000) for x,y in zip(p,expected))
    use=[v for k,v in rows.items() if k!='reset']
    summary={k:sum(v[k] for v in use) for k in ['comp','severe','expandedComp','expandedOverlap','elbowComp','elbowSevere','elbowOverlap','shirt2','shirt5']}
    summary['distalRms']=float(np.mean([v['distalRms'] for v in use]))
    summary['distalMax']=max(v['distalMax'] for v in use)
    summary['minDepth']=min(v['minDepth'] for v in use)
    report[name]={'summary':summary,'states':rows}
    print(name,json.dumps(summary),flush=True)
for k,v in report['v2']['states'].items():
    b=report['v1']['states'][k]
    print(k,'overlap',b['expandedOverlap'],v['expandedOverlap'],'shirt2',b['shirt2'],v['shirt2'],'shirt5',b['shirt5'],v['shirt5'],'rms',round(b['distalRms'],4),round(v['distalRms'],4),'prediction_error_mm',v['predictionMaxErrorMm'],flush=True)
with (out/'runtime-clearance.json').open('x',encoding='utf8') as f:json.dump(report,f,indent=2)
print('ARM_TAPER_RUNTIME_MEASURED',flush=True)
