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

# Measure the spatial smoothness of the correction, not just its magnitude.
# Fixed bind bins on the unique arm skin; both medial and lateral surfaces.
q=bind[0].astype(np.float64).copy(); q[:,0]=abs(q[:,0]); q-=start
lateral=(q-t[:,None]*axis)[:,0]
bands=[]
for u in np.linspace(.35,1.25,19):
    bands.append([first[(abs(t[first]-u)<.055)&(abs(bind[0][first,0])>.24)&(r[first]<.105)&(sign*lateral[first]>.008)] for sign in [-1,1]])
assert min(len(b) for band in bands for b in band)>4
def curve(p,n):
    displacement=(p[0]-n[0]).copy();displacement[:,0]*=np.sign(bind[0][:,0])
    x=np.array([[displacement[b].mean(axis=0) for b in band] for band in bands])*1000
    return dict(bendRms=float(np.sqrt(np.mean(np.diff(x,n=2,axis=0)**2))),bendMax=float(np.linalg.norm(np.diff(x,n=2,axis=0),axis=-1).max()))
def special_gate(p,par):
    a,b,amount,outer_early,span=par
    tt,rr=longitudinal(p)
    qq=p.astype(np.float64).copy();qq[:,0]=abs(qq[:,0]);qq-=start
    side=(qq-tt[:,None]*axis)[:,0]
    outside=ramp(side,-.025,.035)
    # earlier, longer fade on outer arm, preserve medial contact response.
    aa=a-outer_early*outside
    bb=b+span*outside
    limb=ramp(abs(p[:,0]),.21,.29)
    return 1-amount*limb*ramp(tt,aa,bb)

newmeta=json.loads((out/'contour-runtime.json').read_text(encoding='utf8'))
newraw=Path('.bodyforge-qa/arm-taper-20261127/contour-runtime.bin').read_bytes()
assert len(newraw)==newmeta['binaryBytes'] and hashlib.sha256(newraw).hexdigest()==newmeta['binarySha256']
def newarr(ref,dt):
    return np.frombuffer(newraw,dtype=dt,count=ref['bytes']//4,offset=ref['offset']).reshape(-1,3)
for i,st in enumerate(newmeta['report']['baseline']['stats']):
    assert np.array_equal(newarr(st['bind'],'<f4'),bind[i])
    assert np.array_equal(newarr(st['indices'],'<u4'),faces[i])
prior=json.loads((out/'runtime-clearance.json').read_text(encoding='utf8'))
rows={}
for state,(n,v) in samples.items():
    for i,ref in enumerate(newmeta['report']['baseline']['samples'][state]):
        assert np.array_equal(newarr(ref,'<f4'),n[i]),(state,i)
    p=[newarr(r,'<f4') for r in newmeta['report']['candidate']['samples'][state]]
    predicted=[n[i]+(v[i]-n[i])*special_gate(bind[i],(.50,1.30,1,.40,.20))[:,None] if i<2 else n[i] for i in range(len(n))]
    row=dict(stats(p,n),**curve(p,n))
    row['predictionMaxErrorMm']=max(float(np.max(np.linalg.norm(x-y,axis=1))*1000) for x,y in zip(p,predicted))
    old=prior['v1']['states'][state]
    for k in ['comp','severe','expandedComp','expandedOverlap','elbowComp','elbowSevere','elbowOverlap','shirt2','shirt5']:assert row[k]<=old[k],(state,k,row[k],old[k])
    assert row['predictionMaxErrorMm']<.001
    assert row['minDepth']>=old['minDepth']-.001
    rows[state]=row
    print(state,json.dumps(row),flush=True)
use=[v for k,v in rows.items() if k!='reset']
summary={k:sum(v[k] for v in use) for k in ['comp','severe','expandedComp','expandedOverlap','elbowComp','elbowSevere','elbowOverlap','shirt2','shirt5']}
for k in ['distalRms','bendRms']:summary[k]=float(np.mean([v[k] for v in use]))
for k in ['distalMax','bendMax','predictionMaxErrorMm']:summary[k]=max(v[k] for v in use)
summary['minDepth']=min(v['minDepth'] for v in use)
with (out/'contour-runtime-clearance.json').open('x',encoding='utf8') as f:json.dump({'summary':summary,'states':rows},f,indent=2)
print('CONTOUR_RUNTIME_PASS',json.dumps(summary),flush=True)
