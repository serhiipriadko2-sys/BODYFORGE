"""Experimental anatomical scan reprojection, with protected facial seams.
Blender 5.2; output review assets only, never overwrite production geometry.
Infinite 3D Head Scan: Lee Perry-Smith / Infinite-Realities, CC BY 3.0.
See .bodyforge-qa/scan-donor-20261125/LeePerrySmith_License.txt.
"""
import bpy, hashlib, importlib.util, json, sys
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
folder=root/'.bodyforge-qa/scan-donor-20261125'
source=root/'public/assets/bodyforge-athlete-efficient.glb'
donor=folder/'LeePerrySmith.glb'
assert hashlib.sha256(source.read_bytes()).hexdigest()=='df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e'
assert hashlib.sha256(donor.read_bytes()).hexdigest()=='402b8a8ac9f03232e6d64b5962929703a069daf99d3c49ac8eb0e48bedc9c576'
color_path=folder/'Map-COL.jpg'
assert hashlib.sha256(color_path.read_bytes()).hexdigest()=='e976d73b31407f8d0967412bf468019ed26a5d5a32cf5811aabff7e816458a65'
for name in ('transfer-review.blend','transfer-field.json','transfer-comparison.png'):
    assert not (folder/name).exists(),name
spec=importlib.util.spec_from_file_location('bf_face',Path(__file__).with_name('author-avatar-face.py'))
face=importlib.util.module_from_spec(spec);spec.loader.exec_module(face)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
body=bpy.data.objects['BODYFORGE_Body']
base=face.positions(body.data)
previous,_=face.deform(base,json.loads((root/'src/lib/avatarFaceProfile.json').read_text())['zones'])
previous,_=face.deform(previous,[{**z,'pigment':[0,0,0]} for z in json.loads((root/'src/lib/avatarFaceContour.json').read_text())['zones']])
bpy.ops.import_scene.gltf(filepath=str(donor))
scan=bpy.data.objects['LeePerrySmith']
dp=face.positions(scan.data)
scan.data.calc_loop_triangles();body.data.calc_loop_triangles()
dtri=np.array([t.vertices[:] for t in scan.data.loop_triangles])
btri=np.array([t.vertices[:] for t in body.data.loop_triangles])
dtree=BVHTree.FromPolygons(dp.tolist(),dtri.tolist(),all_triangles=True)
btree=BVHTree.FromPolygons(previous.tolist(),btri.tolist(),all_triangles=True)

# Manually annotated corresponding 2D landmarks in the two 440px
# orthographic inspection images. Deliberately do not project eyelid
# or mouth interior geometry from the closed-eye scan.
# Pixel y is top-down. These are hand-authored registration points,
# not biometric/clinical measurements.
pairs=[
 ('forehead top',(220,8),(216,22)),
 ('forehead L',(90,100),(155,68)),('forehead R',(350,100),(279,68)),
 ('outer brow L',(100,193),(159,123)),('outer brow R',(340,193),(271,123)),
 ('eye L',(147,205),(184,131)),('eye R',(294,205),(244,131)),
 ('inner eye L',(178,208),(200,132)),('inner eye R',(263,208),(229,132)),
 ('bridge',(220,219),(215,139)),
 ('cheek L',(87,257),(155,157)),('cheek R',(353,257),(274,157)),
 ('malar L',(130,246),(174,150)),('malar R',(310,246),(258,150)),
 ('nose tip',(220,279),(215,167)),
 ('nose wing L',(184,281),(203,172)),('nose wing R',(257,281),(229,172)),
 ('mouth L',(164,337),(192,199)),('mouth R',(276,337),(240,199)),
 ('upper lip',(220,315),(215,191)),('lower lip',(220,354),(215,207)),
 ('chin',(220,392),(215,236)),
 ('jaw L',(92,365),(164,222)),('jaw R',(349,365),(267,222)),
 ('jaw low L',(132,392),(183,240)),('jaw low R',(308,392),(249,240)),
 ('temple L',(52,185),(143,120)),('temple R',(388,185),(290,120)),
]
xy=np.array([p[1] for p in pairs],float)/439
uv=np.array([p[2] for p in pairs],float)/439
def kernel(r2):
    return r2*np.log(np.maximum(r2,1e-14))
r2=((xy[:,None]-xy[None,:])**2).sum(axis=2)
P=np.column_stack((np.ones(len(xy)),xy))
K=kernel(r2)+np.eye(len(xy))*1e-5
coef=np.linalg.solve(np.block([[K,P],[P.T,np.zeros((3,3))]]),np.vstack((uv,np.zeros((3,2)))))
def warp(q):
    q=np.atleast_2d(q)
    rr=((q[:,None]-xy[None,:])**2).sum(axis=2)
    return np.column_stack((kernel(rr),np.ones(len(q)),q))@coef
err=np.linalg.norm(warp(xy)-uv,axis=1)*439
assert err.max()<1.0
# Check that the 2D warp has no fold in the face rectangle.
test=np.array([(x,y) for x in np.linspace(.15,.85,40) for y in np.linspace(.22,.89,40)])
eps=.0001
a=(warp(test+[eps,0])-warp(test-[eps,0]))/(2*eps)
b=(warp(test+[0,eps])-warp(test-[0,eps]))/(2*eps)
det=a[:,0]*b[:,1]-a[:,1]*b[:,0]
assert det.min()>.035,det.min()

def smooth(v,lo,hi):
    t=np.clip((v-lo)/(hi-lo),0,1)
    return t*t*(3-2*t)
def mask(x,h):
    a=np.abs(x)
    # Eyes, forehead/hair, lip seam and neck are never transferred.
    edge=(1-smooth(a,.051,.068))*smooth(h,1.557,1.574)*(1-smooth(h,1.647,1.658))
    mouth=1-(1-smooth(a,.031,.041))*smooth(h,1.577,1.586)*(1-smooth(h,1.616,1.626))
    return edge*mouth

# Grid in avatar units. Front depth transfer uses a fitted global affine
# depth scale, then bounded, smoothed residual rather than nearest vertices.
n=128;xlo,xhi=-.07,.07;hlo,hhi=1.554,1.658
xs=np.linspace(xlo,xhi,n);hs=np.linspace(hlo,hhi,n)
X,H=np.meshgrid(xs,hs)
q=np.column_stack(((X.ravel()+.095)/.19,(1.785-H.ravel())/.24))
mapped=warp(q)
sx=mapped[:,0]*9-4.5;sh=4.3-mapped[:,1]*8.6
old=np.full(n*n,np.nan);sc=np.full(n*n,np.nan)
for i,(x,h,xx,hh) in enumerate(zip(X.ravel(),H.ravel(),sx,sh)):
    a,an,_,_=btree.ray_cast(Vector((x,-.4,h)),Vector((0,1,0)),.5)
    b,bn,_,_=dtree.ray_cast(Vector((xx,-10,hh)),Vector((0,1,0)),20)
    if a is not None and b is not None and an.y<-.12 and bn.y<-.12:
        old[i]=-a.y;sc[i]=-b.y
m=mask(X.ravel(),H.ravel())
fit=np.isfinite(old)&np.isfinite(sc)&(m>.30)&(old>.105)
assert fit.sum()>2000
A=np.column_stack((sc[fit],np.ones(fit.sum())))
slope,offset=np.linalg.lstsq(A,old[fit],rcond=None)[0]
assert .012<slope<.075,(slope,offset)
residual=np.where(np.isfinite(old)&np.isfinite(sc),sc*slope+offset-old,0)
rms=float(np.sqrt(np.mean(residual[fit]**2)))
# Smooth invalid samples and sharp donor features before applying the
# small, explicitly gated shape. Original topology stays untouched.
r=np.clip(residual,-.006,.006).reshape(n,n)
for _ in range(5):
    pad=np.pad(r,1,mode='edge')
    r=(4*r+pad[:-2,1:-1]+pad[2:,1:-1]+pad[1:-1,:-2]+pad[1:-1,2:])/8
field=np.rint(np.clip(r*m.reshape(n,n)*.35,-.0021,.0021)*100000).astype(int)
field[[0,-1],:]=0;field[:,[0,-1]]=0

def sample_field(x,h):
    u=(x-xlo)/(xhi-xlo)*(n-1);v=(h-hlo)/(hhi-hlo)*(n-1)
    inside=(u>0)&(u<n-1)&(v>0)&(v<n-1)
    u=np.clip(u,0,n-1-1e-9);v=np.clip(v,0,n-1-1e-9)
    ix=u.astype(int);iy=v.astype(int);fx=u-ix;fy=v-iy
    return ((field[iy,ix]*(1-fx)+field[iy,ix+1]*fx)*(1-fy)+(field[iy+1,ix]*(1-fx)+field[iy+1,ix+1]*fx)*fy)*1e-5*inside
p=face.to_gltf(previous);x,h,z=p.T
delta=sample_field(x,h)*smooth(z,.085,.115)
# Hard zero guard for the protected seam (the smooth mask is already zero).
protected=(h>=1.658)|(h<=1.554)|((abs(x)<=.031)&(h>=1.586)&(h<=1.616))|(z<=.085)
delta[protected]=0
new=p.copy();new[:,2]+=delta;new=face.to_blender(new)
def cross(v):
    t=v[btri];return np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0])
a=cross(previous);b=cross(new);area=np.linalg.norm(a,axis=1)
valid=(area>1e-10)&np.any(abs(delta[btri])>1e-8,axis=1)
ratio=(a[valid]*b[valid]).sum(axis=1)/area[valid]**2
assert ratio.min()>.55 and abs(delta).max()<=.00301,(ratio.min(),abs(delta).max())
changed=int(np.count_nonzero(abs(delta)>.00005));assert changed>500
# Editable source rig and scan are both retained, with a separate key.
body.shape_key_add(name='Basis',from_mix=False)
basekey=body.shape_key_add(name='Face V3 refined',from_mix=False)
basekey.data.foreach_set('co',previous.astype(np.float32).ravel());basekey.value=1
key=body.shape_key_add(name='Scan transferred depth - experimental',from_mix=False)
key.relative_key=basekey;key.data.foreach_set('co',new.astype(np.float32).ravel());key.value=1
# Scale and translate donor for visual reference only; the non-affine
# anatomical registration remains defined by the landmark table.
scan.scale=(.031,.031,.031);scan.location=(.29,-offset,1.65)
mat=scan.data.materials[0];mat.use_nodes=True
image=bpy.data.images.load(str(color_path.resolve()))
tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;image.pack()
mat.node_tree.links.new(tex.outputs['Color'],mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True);bpy.context.view_layer.objects.active=body;body.active_shape_key_index=2
bpy.context.view_layer.update()
out=folder/'transfer-review.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(out.resolve()),compress=True)
recipe=dict(id='scan-depth-review-v1',sourceSha256=hashlib.sha256(donor.read_bytes()).hexdigest(),
  bodySha256=hashlib.sha256(source.read_bytes()).hexdigest(),size=n,bounds=[xlo,xhi,hlo,hhi],
  unitMeters=1e-5,values=field.ravel().tolist(),landmarks=[dict(name=name,target=t,donor=d) for name,t,d in pairs])
(folder/'transfer-field.json').write_text(json.dumps(recipe,separators=(',',':'))+'\n',encoding='utf8')
# Normal-shaded equal framing comparison. This is offline geometry only,
# not a claim of the final game's skin, eyes, hair or illumination.
def panel(points):
    tree=BVHTree.FromPolygons(points.tolist(),btri.tolist(),all_triangles=True)
    w=360;h=440
    out=np.full((h,w,4),.10,dtype=np.float32);out[:,:,3]=1
    light=Vector((-.35,-1,.65)).normalized()
    for j,y in enumerate(np.linspace(1.545,1.785,h)):
        for i,x in enumerate(np.linspace(-.095,.095,w)):
            hit,n,_,_=tree.ray_cast(Vector((x,-.4,y)),Vector((0,1,0)),.5)
            if hit is not None:out[j,i,:3]=.32+.55*max(0,n.dot(light))
    return out
comparison=np.concatenate((panel(previous),panel(new)),axis=1)
im=bpy.data.images.new('Scan depth comparison',720,440,alpha=False)
im.pixels.foreach_set(comparison.ravel());im.filepath_raw=str(folder/'transfer-comparison.png');im.file_format='PNG';im.save()
print('SCAN_TRANSFER',json.dumps(dict(landmarks=len(pairs),maxLandmarkErrorPx=float(err.max()),minWarpJacobian=float(det.min()),
 matchedGrid=int(fit.sum()),depthScale=float(slope),depthOffset=float(offset),rawResidualRmsMm=rms*1000,
 affectedVertices=changed,peakMm=float(abs(delta).max()*1000),protectedVertices=int(protected.sum()),
 affectedTriangles=int(valid.sum()),minTriangleOrientation=float(ratio.min()),fieldNonZero=int(np.count_nonzero(field)))))
for name in ('transfer-review.blend','transfer-field.json','transfer-comparison.png'):
    f=folder/name
    print('RECEIPT',name,f.stat().st_size,hashlib.sha256(f.read_bytes()).hexdigest())
