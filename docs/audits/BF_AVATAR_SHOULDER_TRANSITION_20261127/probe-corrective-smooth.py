"""Blender corrective-smooth experiment on the actual CPU-skinned mesh.
No edit to source GLB. The welded mesh is an offline solver only."""
import bpy,numpy as np,json,hashlib
from pathlib import Path
audit=Path('docs/audits/BF_AVATAR_SHOULDER_TRANSITION_20261127')
folder=Path('.bodyforge-qa/shoulder-transition-20261127')
meta=json.loads((audit/'diagnostic.json').read_text(encoding='utf8'));b=(folder/'diagnostic.bin').read_bytes()
assert hashlib.sha256(b).hexdigest()==meta['binarySha256']
n=meta['vertices'];ni=meta['indices']
indices=np.frombuffer(b,dtype='<u4',count=ni).reshape(-1,3)
points=np.frombuffer(b,dtype='<f4',offset=ni*4).reshape(-1,n,3)
bind=points[0]
_,first,inv=np.unique(np.rint(bind.astype(np.float64)*1e6).astype(np.int64),axis=0,return_index=True,return_inverse=True)
tri=inv[indices];centres=bind[indices].mean(axis=1)
roi=(abs(centres[:,0])>=.10)&(abs(centres[:,0])<=.34)&(centres[:,1]>=1.25)&(centres[:,1]<=1.49)
def area(p):
    t=p[indices]
    return np.linalg.norm(np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]),axis=1)
a0=area(bind);roi &= a0>=1e-10
def stats(p):
    r=area(p)[roi]/a0[roi]
    return dict(p01=float(np.percentile(r,1)),p05=float(np.percentile(r,5)),below055=int((r<.55).sum()),below025=int((r<.25).sum()),min=float(r.min()))
def ramp(x,a,b):
    t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
x=np.abs(bind[first,0]);y=bind[first,1];z=bind[first,2]
shoulder=ramp(x,.125,.17)*(1-ramp(x,.30,.37))*ramp(y,1.22,1.30)*(1-ramp(y,1.47,1.53))
neck=ramp(x,.055,.10)*(1-ramp(x,.20,.27))*ramp(y,1.40,1.46)*(1-ramp(y,1.50,1.54))
mask=np.maximum(shoulder,neck)
# Keep vertices at the nipple rim and lip/head out of this local correction.
assert mask[y>=1.54].max()==0
bpy.ops.wm.read_factory_settings(use_empty=True)
m=bpy.data.meshes.new('Welded diagnostic only')
m.from_pydata(bind[first].tolist(),[],tri.tolist());m.update()
o=bpy.data.objects.new('Shoulder corrective smooth probe',m);bpy.context.collection.objects.link(o)
bpy.context.view_layer.objects.active=o;o.select_set(True)
g=o.vertex_groups.new(name='Shoulder and clavicle mask')
for i,w in enumerate(mask):
    if w>0:g.add([i],float(w),'REPLACE')
basis=o.shape_key_add(name='Basis',from_mix=False)
for k,name in enumerate(meta['states'][1:],1):
    key=o.shape_key_add(name=name,from_mix=False);key.data.foreach_set('co',points[k,first].ravel())
mod=o.modifiers.new(name='Localized corrective smooth',type='CORRECTIVE_SMOOTH')
mod.rest_source='BIND';mod.vertex_group=g.name;mod.smooth_type='LENGTH_WEIGHTED'
mod.factor=.55;mod.iterations=12;mod.use_pin_boundary=True
bpy.ops.object.correctivesmooth_bind(modifier=mod.name)
assert mod.is_bind
deps=bpy.context.evaluated_depsgraph_get()
keys=o.data.shape_keys.key_blocks
report=[];exports={}
for iterations in [6,12,24,40]:
    mod.iterations=iterations
    for name in ['relaxed','neutral','arms','core','back','max']:
        for key in list(keys)[1:]:key.value=float(key.name==name)
        bpy.context.view_layer.update()
        ev=o.evaluated_get(deps)
        arr=np.empty(len(first)*3,np.float32);ev.data.vertices.foreach_get('co',arr)
        candidate=arr.reshape(-1,3)[inv]
        k=meta['states'].index(name);old=points[k]
        delta=candidate-old;distance=np.linalg.norm(delta,axis=1)
        # Limit the maximum movement in the candidate; assess this actual output.
        cap=.012
        candidate=old+delta*np.minimum(1,cap/np.maximum(distance,1e-12))[:,None]
        assert np.isfinite(candidate).all()
        r=dict(iterations=iterations,name=name,old=stats(old),new=stats(candidate),peakMm=float(np.linalg.norm(candidate-old,axis=1).max()*1000),
               changed=int((np.linalg.norm(candidate-old,axis=1)>.0001).sum()))
        report.append(r)
        if name in ['neutral','max']:exports[f'{iterations}-{name}']=candidate.astype(np.float32)
        print(json.dumps(r),flush=True)
out=folder/'corrective-probe.npz'
assert not out.exists();np.savez_compressed(out,**exports)
with (audit/'corrective-probe.json').open('x',encoding='utf8') as fp:json.dump(dict(solver='Blender Corrective Smooth, bound on original weld, capped displacement',report=report,probeSha256=hashlib.sha256(out.read_bytes()).hexdigest()),fp,indent=2)
print('CORRECTIVE_PROBE_COMPLETE',flush=True)
