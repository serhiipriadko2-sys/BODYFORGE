"""Author a UV-fitted dermal pigment layer for the pinned CC0 BODYFORGE athlete.

Run with Blender, isolated factory settings. Original textures remain unchanged.
The generated pattern is authored, not a scan or a photograph of a person.
"""
import hashlib
from pathlib import Path
import sys
import bpy
import numpy as np

model, albedo, output = (Path(arg).resolve() for arg in sys.argv[sys.argv.index('--') + 1:])
assert hashlib.sha256(model.read_bytes()).hexdigest() == 'df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e'
assert hashlib.sha256(albedo.read_bytes()).hexdigest() == 'e633c84f1ae7647005cf622e2ba1f866bc8d72ff6905b3c97e4ee8497b7a2be7'
if output.exists():
    raise FileExistsError(output)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(model))
mesh = bpy.data.objects['BODYFORGE_Body'].data
mesh.calc_loop_triangles()
uv = mesh.uv_layers.active.uv
image = bpy.data.images.load(str(albedo))
w, h = image.size
assert w == h == 2048
# Use continuous model-space fields so pigment does not jump at UV seams.
tint = np.zeros((h,w,3), dtype=np.float32)
coverage = np.zeros((h,w), dtype=bool)

def pigment(x, y, z):
    a = np.abs(x)
    front = np.clip((y-.055)/.055,0,1)
    def blob(cx, cy, cz, sx, sy, sz):
        return np.exp(-((a-cx)/sx)**2-((y-cy)/sy)**2-((z-cz)/sz)**2)
    # Vascular tint at nose, cheek and ears; darker eye sockets and jaw.
    blush = (.55*blob(.005,.166,1.645,.022,.030,.024) +
             .62*blob(.055,.113,1.635,.026,.038,.025) +
             .78*blob(.084,.025,1.659,.023,.043,.037))
    socket = blob(.030,.139,1.670,.027,.026,.011)
    temple = blob(.068,.095,1.687,.019,.031,.025)
    lip = ((a<.034)&(z>1.584)&(z<1.615)&(y>.10))
    # Layer low/mid frequency in metres. Bounded grain at ~1mm, no white noise
    # at texel scale, so mipmaps preserve the wider pigmentation.
    n = (.45*np.sin(x*341+y*177+z*217)*np.sin(x*199-y*251+z*113) +
         .32*np.sin(x*831-y*607+z*419)*np.sin(y*509+z*613) +
         .23*np.sin(x*2701+y*1901-z*1387)*np.sin(x*1507-z*2459))
    variation = n * .045
    fade = np.clip((z-1.53)/.035,0,1)
    rgb = np.stack([variation + blush*.042 - socket*.053,
                    variation - blush*.057 - socket*.083 - temple*.025,
                    variation - blush*.072 - socket*.037 - temple*.006],axis=1)
    rgb *= fade[:,None]
    rgb[lip] = 0
    return np.clip(rgb,-.14,.085)

for face in mesh.loop_triangles:
    pts = np.array([mesh.vertices[i].co[:] for i in face.vertices])
    if pts[:,2].max() < 1.53:
        continue
    texels = np.array([tuple(uv[i].vector) for i in face.loops]) * [w,h] - .5
    lo = np.maximum(0,np.ceil(texels.min(axis=0)).astype(int))
    hi = np.minimum([w-1,h-1],np.floor(texels.max(axis=0)).astype(int))
    if (hi<lo).any(): continue
    basis = (texels[1:]-texels[0]).T
    if abs(np.linalg.det(basis)) < 1e-8: continue
    xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1),np.arange(lo[1],hi[1]+1))
    u,v=np.linalg.inv(basis)@(np.stack((xx.ravel(),yy.ravel()))-texels[0,:,None])
    keep=(u>=-1e-6)&(v>=-1e-6)&(u+v<=1.000001)
    xi,yi=xx.ravel()[keep],yy.ravel()[keep]
    pos=pts[0]+u[keep,None]*(pts[1]-pts[0])+v[keep,None]*(pts[2]-pts[0])
    tint[yi,xi]=pigment(pos[:,0],-pos[:,1],pos[:,2])
    coverage[yi,xi]=True

pixels=np.empty(w*h*4,dtype=np.float32)
image.pixels.foreach_get(pixels)
pixels=pixels.reshape(h,w,4)
# Pad UV island boundary by two texels for filtered sampling. Never wrap.
for _ in range(2):
    padded=np.pad(coverage,1)
    expanded=coverage.copy()
    for dy,dx in ((-1,0),(1,0),(0,-1),(0,1)):
        src=padded[1+dy:1+dy+h,1+dx:1+dx+w]
        mask=src&~expanded
        shifted=np.pad(tint,((1,1),(1,1),(0,0)))[1+dy:1+dy+h,1+dx:1+dx+w]
        tint[mask]=shifted[mask]
        expanded|=mask
    coverage=expanded
assert np.count_nonzero(coverage)>10000
assert np.isfinite(tint).all()
pixels[:,:,:3]=np.clip(pixels[:,:,:3]*(1+tint),0,1)
image.pixels.foreach_set(pixels.ravel())
image.filepath_raw=str(output)
image.file_format='JPEG'
image.save(quality=94)
print('BODYFORGE_DERMAL_SKIN',output.stat().st_size,hashlib.sha256(output.read_bytes()).hexdigest(),
      'covered_texels',int(coverage.sum()),'tint_range',float(tint.min()),float(tint.max()))
