"""Bounded photo-colour reprojection onto BODYFORGE's existing UV atlas.
Infinite 3D Head Scan by Lee Perry-Smith / Infinite-Realities, CC BY 3.0.
Blender 5.2: --background --factory-startup --disable-autoexec
 --python-exit-code 1 --python scripts/bake-avatar-scan-color.py -- PROJECT_ROOT
Experimental asset only, no replacement of production textures.
"""
import hashlib, importlib.util, json, sys
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
folder=root/'.bodyforge-qa/scan-donor-20261125'
body_path=root/'public/assets/bodyforge-athlete-efficient.glb'
scan_path=folder/'LeePerrySmith.glb'
photo_path=folder/'Map-COL.jpg'
base_path=root/'public/assets/athlete-skin-perioral.jpg'
field_path=root/'src/lib/avatarScanTransferField.json'
output=root/'src/lib/athlete-skin-scan-review.jpg'
for path,expected in [
 (body_path,'df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e'),
 (scan_path,'402b8a8ac9f03232e6d64b5962929703a069daf99d3c49ac8eb0e48bedc9c576'),
 (photo_path,'e976d73b31407f8d0967412bf468019ed26a5d5a32cf5811aabff7e816458a65'),
 (base_path,'8cb93dfdb95c20fcb73d5eb9b5e3f0f9e636855cf44733074cec259c87eb19c0'),
 (field_path,'b9c06e31e43aaa794cd8f3752157a123cf228647f278ff10d5e2c1b56e8068a8')]:
    assert hashlib.sha256(path.read_bytes()).hexdigest()==expected,path
assert not output.exists()
spec=importlib.util.spec_from_file_location('bf_face',Path(__file__).with_name('author-avatar-face.py'))
face=importlib.util.module_from_spec(spec);spec.loader.exec_module(face)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(body_path))
body=bpy.data.objects['BODYFORGE_Body'].data
p,_=face.deform(face.positions(body),json.loads((root/'src/lib/avatarFaceProfile.json').read_text())['zones'])
p,_=face.deform(p,[{**z,'pigment':[0,0,0]} for z in json.loads((root/'src/lib/avatarFaceContour.json').read_text())['zones']])
bpy.ops.import_scene.gltf(filepath=str(scan_path))
scan=bpy.data.objects['LeePerrySmith'].data
dp=face.positions(scan)
def mesh_data(mesh,points):
    mesh.calc_loop_triangles()
    tri=np.array([t.vertices[:] for t in mesh.loop_triangles])
    uv=np.array([[tuple(mesh.uv_layers.active.uv[i].vector) for i in t.loops] for t in mesh.loop_triangles])
    return tri,uv,BVHTree.FromPolygons(points.tolist(),tri.tolist(),all_triangles=True)
bt,bu,btree=mesh_data(body,p)
dt,du,dtree=mesh_data(scan,dp)
recipe=json.loads(field_path.read_text())
xy=np.array([item['target'] for item in recipe['landmarks']],float)/439
uv=np.array([item['donor'] for item in recipe['landmarks']],float)/439
def kernel(r2):return r2*np.log(np.maximum(r2,1e-14))
r2=((xy[:,None]-xy[None,:])**2).sum(axis=2)
P=np.column_stack((np.ones(len(xy)),xy))
coef=np.linalg.solve(np.block([[kernel(r2)+np.eye(len(xy))*1e-5,P],[P.T,np.zeros((3,3))]]),np.vstack((uv,np.zeros((3,2)))))
def warp(q):
    r=((q[:,None]-xy[None,:])**2).sum(axis=2)
    return np.column_stack((kernel(r),np.ones(len(q)),q))@coef
def image_pixels(path):
    im=bpy.data.images.load(str(path),check_existing=False)
    w,h=im.size
    px=np.empty(w*h*4,dtype=np.float32);im.pixels.foreach_get(px)
    return im,px.reshape(h,w,4)
photo,src=image_pixels(photo_path)
base,old=image_pixels(base_path)
assert tuple(photo.size)==(1024,1024) and tuple(base.size)==(2048,2048)
# Blender pixels are linear for these sRGB source images.
def bilinear(img,u,v):
    h,w=img.shape[:2]
    u=np.clip(u*w-.5,0,w-1.000001);v=np.clip(v*h-.5,0,h-1.000001)
    i=np.floor(u).astype(int);j=np.floor(v).astype(int)
    a=(u-i)[...,None];b=(v-j)[...,None]
    return ((img[j,i]*(1-a)+img[j,i+1]*a)*(1-b)+(img[j+1,i]*(1-a)+img[j+1,i+1]*a)*b)
def hit_uv(point,verts,tex):
    a,b,c=verts;v0=b-a;v1=c-a;v2=np.array(point)-a
    d00=v0@v0;d01=v0@v1;d11=v1@v1
    den=d00*d11-d01*d01
    if den<=1e-20:return None
    u=(d11*(v2@v0)-d01*(v2@v1))/den
    v=(d00*(v2@v1)-d01*(v2@v0))/den
    if min(u,v,1-u-v)<-.003:return None
    return tex[0]+u*(tex[1]-tex[0])+v*(tex[2]-tex[0])
def smooth(v,lo,hi):
    t=np.clip((v-lo)/(hi-lo),0,1)
    return t*t*(3-2*t)
def mask(x,h,z):
    a=np.abs(x)
    edge=(1-smooth(a,.050,.067))*smooth(h,1.557,1.575)*(1-smooth(h,1.642,1.657))*smooth(z,.095,.118)
    mouth=1-(1-smooth(a,.033,.045))*smooth(h,1.578,1.586)*(1-smooth(h,1.616,1.628))
    # The first paired portraits exposed a false pigment stripe on the chin
    # and dark nose projection. Keep only the well-supported lateral cheeks.
    cheeks=smooth(a,.028,.040)*smooth(h,1.586,1.608)
    return edge*mouth*cheeks
N=320
xmin,xmax=-.07,.07; ymin,ymax=1.554,1.658
X,H=np.meshgrid(np.linspace(xmin,xmax,N),np.linspace(ymin,ymax,N))
mapped=warp(np.column_stack(((X.ravel()+.095)/.19,(1.785-H.ravel())/.24)))
sx=mapped[:,0]*9-4.5;sh=4.3-mapped[:,1]*8.6
colors=np.zeros((N*N,3));baseline=np.zeros_like(colors);confidence=np.zeros(N*N);depth=np.zeros(N*N)
for i,(x,y,dx,dy) in enumerate(zip(X.ravel(),H.ravel(),sx,sh)):
    a,an,ai,_=btree.ray_cast(Vector((x,-.4,y)),Vector((0,1,0)),.5)
    b,bn,bi,_=dtree.ray_cast(Vector((dx,-10,dy)),Vector((0,1,0)),20)
    if a is None or b is None or an.y>-.20 or bn.y>-.20:continue
    z=-a.y; m=mask(x,y,z)
    if m<=0:continue
    u=hit_uv(a,p[bt[ai]],bu[ai]);v=hit_uv(b,dp[dt[bi]],du[bi])
    if u is None or v is None:continue
    colors[i]=bilinear(src,*v)[:3];baseline[i]=bilinear(old,*u)[:3]
    confidence[i]=m*smooth(-an.y,.20,.55)*smooth(-bn.y,.20,.55)
    depth[i]=z
good=confidence>.55
assert good.sum()>6000
# Global per-channel median matching avoids a visible patch of another
# skin tone; not a claim of calibrated or fully de-lit albedo.
gain=np.clip(np.median(baseline[good],axis=0)/np.maximum(np.median(colors[good],axis=0),.05),.65,1.55)
colors=np.clip(colors*gain,0,1)
# Weighted low-pass removes broad donor illumination while retaining
# actual medium/high-frequency chromatic structure and stubble.
def blur(a,sigma):
    r=int(3*sigma);k=np.exp(-.5*(np.arange(-r,r+1)/sigma)**2);k/=k.sum()
    for axis in (0,1):
        a=np.apply_along_axis(lambda v:np.convolve(np.pad(v,r,mode='edge'),k,mode='valid'),axis,a)
    return a
c=confidence.reshape(N,N)
rgb=colors.reshape(N,N,3);ref=baseline.reshape(N,N,3)
den=np.maximum(blur(c,17),1e-6)
low=np.stack([blur(rgb[:,:,i]*c,17)/den for i in range(3)],axis=2)
ref_low=np.stack([blur(ref[:,:,i]*c,17)/den for i in range(3)],axis=2)
# Match broad lightness and transfer colour and local variation.
luma=np.array([.2126,.7152,.0722])
light=((ref_low-low)@luma)[:,:,None]
matched=np.clip(rgb+light*.8,0,1)
matched=np.minimum(np.maximum(matched,ref*.72),np.minimum(1,ref*1.32+.025))
w=h=2048
weights=np.zeros((h,w),dtype=np.float32)
new=np.zeros((h,w,3),dtype=np.float32)
def grid_sample(img,x,y):
    return bilinear(img,(x-xmin)/(xmax-xmin)*(N-1)/N+.5/N,(y-ymin)/(ymax-ymin)*(N-1)/N+.5/N)
packed=np.concatenate([matched*c[:,:,None],c[:,:,None],depth.reshape(N,N,1)*c[:,:,None]],axis=2)
for ids,tuv in zip(bt,bu):
    pts=p[ids]
    if pts[:,2].max()<ymin or pts[:,2].min()>ymax or np.min(abs(pts[:,0]))>xmax or -pts[:,1].min()<.095:continue
    texels=tuv*[w,h]-.5
    lo=np.maximum(0,np.ceil(texels.min(axis=0)).astype(int));hi=np.minimum([w-1,h-1],np.floor(texels.max(axis=0)).astype(int))
    if (hi<lo).any():continue
    basis=(texels[1:]-texels[0]).T
    if abs(np.linalg.det(basis))<1e-8:continue
    xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1),np.arange(lo[1],hi[1]+1))
    u,v=np.linalg.inv(basis)@(np.stack((xx.ravel(),yy.ravel()))-texels[0,:,None])
    keep=(u>=-1e-6)&(v>=-1e-6)&(u+v<=1.000001)
    xi,yi=xx.ravel()[keep],yy.ravel()[keep]
    pos=pts[0]+u[keep,None]*(pts[1]-pts[0])+v[keep,None]*(pts[2]-pts[0])
    x,y,z=pos[:,0],pos[:,2],-pos[:,1]
    g=grid_sample(packed,x,y);confidence2=g[:,3]
    safe=np.maximum(confidence2,1e-6)
    weight=.64*np.minimum(mask(x,y,z),confidence2)* (1-smooth(abs(z-g[:,4]/safe),.0008,.0025))
    assert np.all(weight[(abs(x)<=.028)|(y<=1.586)]==0)
    use=weight>weights[yi,xi]
    weights[yi[use],xi[use]]=weight[use]
    new[yi[use],xi[use]]=g[use,:3]/safe[use,None]
# Local blend leaves all unrelated atlas pixels exactly unchanged before JPEG.
before=old[:,:,:3].copy()
old[:,:,:3]=np.clip(before*(1-weights[:,:,None])+new*weights[:,:,None],0,1)
count=int(np.count_nonzero(weights))
assert 7000<count<60000,count
assert np.array_equal(before[weights==0],old[:,:,:3][weights==0])
assert np.isfinite(old).all()
base.pixels.foreach_set(old.ravel())
base.filepath_raw=str(output);base.file_format='JPEG';base.save(quality=94)
reopen=bpy.data.images.load(str(output),check_existing=False)
assert tuple(reopen.size)==(2048,2048) and 0<output.stat().st_size<850000
print('SCAN_COLOR_BAKE',json.dumps(dict(validGrid=int(np.count_nonzero(c)),strongGrid=int(good.sum()),gain=gain.tolist(),
 maskTexels=count,maxWeight=float(weights.max()),meanLinearChange=float(np.abs(before-old[:,:,:3])[weights>0].mean()),
 bytes=output.stat().st_size,sha256=hashlib.sha256(output.read_bytes()).hexdigest())))
