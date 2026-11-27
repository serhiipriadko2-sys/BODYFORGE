"""Inspect the pinned model UV scale and the existing licensed micro-height tile."""
import bpy,numpy as np,json,hashlib
from pathlib import Path
src=Path('public/assets/bodyforge-athlete-efficient.glb')
tex=Path('public/assets/athlete-scan-pores.png')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(src)=='df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e'
assert sha(tex)=='56628fec1902669f0cabb7b2dcda7f5bc7837d042db81f068805aa2a3cae0685'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(src.resolve()))
body=bpy.data.objects['BODYFORGE_Body'].data
body.calc_loop_triangles()
coords=np.empty(len(body.vertices)*3,np.float32);body.vertices.foreach_get('co',coords)
coords=coords.reshape(-1,3)
uv=np.empty(len(body.loops)*2,np.float32);body.uv_layers.active.data.foreach_get('uv',uv);uv=uv.reshape(-1,2)
tri=np.asarray([t.vertices[:] for t in body.loop_triangles]);loops=np.asarray([t.loops[:] for t in body.loop_triangles])
p=coords[tri];t=uv[loops]
v=np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0]);a=np.linalg.norm(v,axis=1)*.5
u=t[:,1]-t[:,0];w=t[:,2]-t[:,0];b=np.abs(u[:,0]*w[:,1]-u[:,1]*w[:,0])*.5
valid=(a>1e-12)&(b>1e-12)
scale=np.zeros_like(a);scale[valid]=np.sqrt(a[valid]/b[valid])/24*1000
c=p.mean(axis=1)
x=np.abs(c[:,0]);y=c[:,2];z=-c[:,1]
regions={'face':(y>1.56)&(z>.075),'torso':(y>1.05)&(y<1.46)&(x<.20),'upper_arm':(y>1.23)&(y<1.43)&(x>.25),
         'forearm':(y>1.10)&(y<1.24)&(x>.38)&(x<.50),'hand':(x>.51)&(y<1.12)&(y>.93),
         'calf':(y>.20)&(y<.49),'thigh':(y>.58)&(y<.92)}
report={}
for k,m in regions.items():
    values=scale[m&valid]
    report[k]={'triangles':len(values),'tileMmP05MedianP95':[float(q) for q in np.percentile(values,[5,50,95])]}
im=bpy.data.images.load(str(tex.resolve()));im.colorspace_settings.name='Non-Color'
assert tuple(im.size)==(256,256)
pix=np.empty(256*256*4,np.float32);im.pixels.foreach_get(pix);h=pix.reshape(256,256,4)[:,:,0]
# Measured source gradients are dimensionless. Physical scale is artistic.
dx=(np.roll(h,-1,1)-np.roll(h,1,1))*.5
dy=(np.roll(h,-1,0)-np.roll(h,1,0))*.5
candidate={}
for period in [.036,.048,.060]:
    for height in [.0004,.0008,.0012]:
        g=np.hypot(dx,dy)*256*height/period
        candidate[f'{period}/{height}']={'rmsSlope':float(np.sqrt(np.mean(g*g))),'p95Slope':float(np.percentile(g,95)),'maxSlope':float(g.max())}
r={'scope':'Area-equivalent tile size on actual UV triangles; not directional distortion or biological pore diameter. Height scales are artistic.',
   'assetSha256':sha(src),'sourceSha256':sha(tex),'uvScale':report,'heightMean':float(h.mean()),'heightStd':float(h.std()),'gradientCandidates':candidate}
out=Path('docs/audits/BF_AVATAR_METRIC_SKIN_20261127/uv-measurements.json')
with out.open('x',encoding='utf-8') as fp:json.dump(r,fp,indent=2)
print('UV_AND_GRADIENT',json.dumps(r),flush=True)
