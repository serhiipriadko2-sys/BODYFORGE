"""Repair the hard rectangular beard/pigment exclusion on the pinned face.
Blender -b --factory-startup --disable-autoexec --python-exit-code 1
 --python scripts/bake-avatar-perioral-transition.py -- BODY_GLB BASE_DETAIL OLD_DERMAL OUTPUT
Rebuild only the bounded mouth neighbourhood from the clean CC0-derived base.
"""
import hashlib, json, sys
from pathlib import Path
import bpy
import numpy as np

model, base, old, output = map(Path,sys.argv[sys.argv.index('--')+1:])
expected = ['df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e',
            'e5d5d5d7eee9568b386ad4a4457714dace161c11fa45f9dd6161a437fc6deaec',
            '3d5fd26f0241d9f21097b619421b0cca3352b4398e2bdbb0c67bc08bb0fe14ab']
for path, digest in zip((model,base,old),expected):
    assert hashlib.sha256(path.read_bytes()).hexdigest() == digest, path
assert not output.exists()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(model.resolve()))
body=bpy.data.objects['BODYFORGE_Body'].data
lips=bpy.data.objects['BODYFORGE_Lips'].data
assert len(lips.vertices)==2320
# Conservative convex projection of the actual lip surface. This protects
# the complete vermilion and avoids a hard box or a guessed ellipse.
points=sorted(set((float(v.co.x),float(v.co.z)) for v in lips.vertices))
def cross(o,a,b):
    return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
def chain(seq):
    hull=[]
    for p in seq:
        while len(hull)>1 and cross(hull[-2],hull[-1],p)<=0:hull.pop()
        hull.append(p)
    return hull
hull=np.array(chain(points)[:-1]+chain(reversed(points))[:-1])
assert len(hull)>12
def distance_from_lips(x,h):
    p=np.stack((x,h),axis=-1)
    distance=np.full(len(x),np.inf)
    inside=np.ones(len(x),dtype=bool)
    for a,b in zip(hull,np.roll(hull,-1,axis=0)):
        v=b-a; w=p-a
        inside &= (v[0]*w[:,1]-v[1]*w[:,0]>=-1e-10)
        t=np.clip((w@v)/(v@v),0,1)
        distance=np.minimum(distance,np.linalg.norm(w-t[:,None]*v,axis=1))
    return np.where(inside,0,distance)

def smooth(v,lo,hi):
    t=np.clip((v-lo)/(hi-lo),0,1)
    return t*t*(3-2*t)

def fields(x,front,h):
    a=np.abs(x)
    d=distance_from_lips(x,h)
    # Feather stubble over a 6mm band outside the measured lip projection.
    # Preserve the whole lip surface, and keep the neighbouring skin smooth.
    beard_gate=smooth(d,.0012,.0072)
    chin=.48*np.exp(-((h-1.561)/.026)**4-(a/.048)**4)
    moustache=.46*np.exp(-((h-(1.617-.13*a))/.007)**2-((a-.023)/.018)**4)
    jaw_height=1.564+.83*np.maximum(0,a-.029)
    jaw=.29*np.exp(-((h-jaw_height)/.021)**2-((a-.051)/.026)**4)
    cheek=.18*np.exp(-((h-1.628)/.031)**2-((a-.067)/.018)**4)
    beard=np.minimum(.54,chin+moustache+jaw+cheek)*np.clip((front-.052)/.04,0,1)*beard_gate
    def blob(cx,cy,cz,sx,sy,sz):
        return np.exp(-((a-cx)/sx)**2-((front-cy)/sy)**2-((h-cz)/sz)**2)
    blush=.55*blob(.005,.166,1.645,.022,.030,.024)+.62*blob(.055,.113,1.635,.026,.038,.025)+.78*blob(.084,.025,1.659,.023,.043,.037)
    socket=blob(.030,.139,1.670,.027,.026,.011)
    temple=blob(.068,.095,1.687,.019,.031,.025)
    n=(.45*np.sin(x*341+front*177+h*217)*np.sin(x*199-front*251+h*113)
       +.32*np.sin(x*831-front*607+h*419)*np.sin(front*509+h*613)
       +.23*np.sin(x*2701+front*1901-h*1387)*np.sin(x*1507-h*2459))
    variation=n*.045
    pigment=np.stack((variation+blush*.042-socket*.053,variation-blush*.057-socket*.083-temple*.025,
                      variation-blush*.072-socket*.037-temple*.006),axis=1)
    pigment*=np.clip((h-1.53)/.035,0,1)[:,None]
    pigment*=smooth(d,.0008,.0055)[:,None]
    # Reconstruct around the former hard exclusion only; fade into the
    # existing atlas well beyond that rectangle.
    weight=(1-smooth(a,.035,.049))*smooth(h,1.572,1.583)*(1-smooth(h,1.617,1.630))*smooth(front,.09,.112)
    return beard,np.clip(pigment,-.14,.085),weight,d

# Both sources are same-resolution sRGB images. Blender exposes linear pixels.
base_image=bpy.data.images.load(str(base.resolve()),check_existing=False)
old_image=bpy.data.images.load(str(old.resolve()),check_existing=False)
assert tuple(base_image.size)==tuple(old_image.size)==(2048,2048)
w,h=old_image.size
noise=np.random.default_rng(20261124).random((h,w),dtype=np.float32)
blend=np.zeros((h,w),dtype=np.float32)
factor=np.ones((h,w,3),dtype=np.float32)
body.calc_loop_triangles()
uv=body.uv_layers.active.uv
for face in body.loop_triangles:
    pts=np.array([body.vertices[i].co[:] for i in face.vertices])
    if pts[:,2].max()<1.572 or pts[:,2].min()>1.630 or np.min(np.abs(pts[:,0]))>.050 or -pts[:,1].min()<.09:continue
    texels=np.array([tuple(uv[i].vector) for i in face.loops])*[w,h]-.5
    lo=np.maximum(0,np.ceil(texels.min(axis=0)).astype(int))
    hi=np.minimum([w-1,h-1],np.floor(texels.max(axis=0)).astype(int))
    if (hi<lo).any():continue
    basis=(texels[1:]-texels[0]).T
    if abs(np.linalg.det(basis))<1e-8:continue
    xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1),np.arange(lo[1],hi[1]+1))
    u,v=np.linalg.inv(basis)@(np.stack((xx.ravel(),yy.ravel()))-texels[0,:,None])
    keep=(u>=-1e-6)&(v>=-1e-6)&(u+v<=1.000001)
    xi,yi=xx.ravel()[keep],yy.ravel()[keep]
    pos=pts[0]+u[keep,None]*(pts[1]-pts[0])+v[keep,None]*(pts[2]-pts[0])
    density,pigment,weight,d=fields(pos[:,0],-pos[:,1],pos[:,2])
    assert np.all(density[d==0]==0)
    mask=density*(.33+.67*np.maximum(0,noise[yi,xi]-.66)/.34)
    factor[yi,xi]=(1-mask[:,None]*[1,.86,.77])*(1+pigment)
    blend[yi,xi]=weight

# Two texels of padding only for the changed island's edges.
for _ in range(2):
    padded=np.pad(blend,1)
    expanded=blend.copy()
    for dy,dx in ((-1,0),(1,0),(0,-1),(0,1)):
        incoming=padded[1+dy:1+dy+h,1+dx:1+dx+w]
        take=(expanded==0)&(incoming>0)
        shifted=np.pad(factor,((1,1),(1,1),(0,0)),constant_values=1)[1+dy:1+dy+h,1+dx:1+dx+w]
        factor[take]=shifted[take]
        expanded[take]=incoming[take]
    blend=expanded
assert np.isfinite(factor).all() and np.isfinite(blend).all()
print('PERIORAL_MASK',int(np.count_nonzero(blend)),float(blend.max()),flush=True)
assert 1000 < np.count_nonzero(blend) < 120000
pixels=np.empty(w*h*4,dtype=np.float32)
original=pixels.copy()
base_image.pixels.foreach_get(original)
old_image.pixels.foreach_get(pixels)
pixels=pixels.reshape(h,w,4)
original=original.reshape(h,w,4)
before=pixels[:,:,:3].copy()
pixels[:,:,:3]=np.clip(before*(1-blend[:,:,None])+original[:,:,:3]*factor*blend[:,:,None],0,1)
assert np.array_equal(before[blend==0],pixels[:,:,:3][blend==0])
old_image.pixels.foreach_set(pixels.ravel())
old_image.filepath_raw=str(output.resolve())
old_image.file_format='JPEG'
old_image.save(quality=94)
readback=bpy.data.images.load(str(output.resolve()),check_existing=False)
assert tuple(readback.size)==(2048,2048)
assert output.stat().st_size<850000
print('PERIORAL_BAKE',json.dumps(dict(hullVertices=len(hull),changedRegionTexels=int(np.count_nonzero(blend)),
      changedLinearTexels=int(np.count_nonzero(np.max(np.abs(before-pixels[:,:,:3]),axis=2)>1e-6)),
      bytes=output.stat().st_size,sha256=hashlib.sha256(output.read_bytes()).hexdigest(),
      dimensions=list(readback.size),unchangedOutsideBeforeEncoding=True)))
