"""Bake authored lip microgrooves and roughness on the pinned athlete.
Blender --background --factory-startup --disable-autoexec --python-exit-code 1
 --python scripts/bake-avatar-lip-response.py -- BODY_GLB OUTPUT_PNG
PNG R=height, G=roughness, B=0, linear numeric channels, no colour transform.
"""
import hashlib, math, struct, sys, zlib
from pathlib import Path
import bpy
import numpy as np

source,output=(Path(s).resolve() for s in sys.argv[sys.argv.index('--')+1:])
assert hashlib.sha256(source.read_bytes()).hexdigest()=='df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e'
if output.exists(): raise FileExistsError(output)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
mesh=bpy.data.objects['BODYFORGE_Lips'].data
p=np.array([[v.co.x,v.co.z,-v.co.y] for v in mesh.vertices])
assert len(p)==2320
lo=p.min(axis=0); hi=p.max(axis=0)
print('LIP_BOUNDS',lo.tolist(),hi.tolist())
assert abs(lo[0]+.0283)<.0001 and abs(lo[1]-1.588)<.0001 and abs(hi[1]-1.6141)<.0001
w,h=256,128
u,v=np.meshgrid((np.arange(w)+.5)/w,(np.arange(h)+.5)/h)
x=2*u-1
# Fine vertical creases fan slightly toward the corners, with several
# spatial frequencies and low-frequency broken line variation.
curve=u+.014*np.sin(v*7.5+x*2.8)+.009*x*(v-.5)
a=.5+.5*np.cos(math.tau*(32*curve+.28*np.sin(15*u)))
b=.5+.5*np.cos(math.tau*(51*curve+.16*np.cos(24*u+2*v)))
c=.5+.5*np.cos(math.tau*(76*curve+.12*np.sin(41*u-3*v)))
mask=np.maximum(0,1-np.abs(x)**4)*np.sin(math.pi*v)**.65
groove=(.52*a**7+.31*b**6+.17*c**5)*mask
height=.55-.26*groove+.035*np.sin(73*u+25*v)*np.sin(19*u-42*v)*mask
rough=.54+.14*groove+.12*(1-mask)-.065*np.exp(-((v-.62)/.17)**2)*(1-x*x)
pixels=np.zeros((h,w,3),dtype=np.uint8)
pixels[:,:,0]=np.round(np.clip(height,0,1)*255)
pixels[:,:,1]=np.round(np.clip(rough,.42,.80)*255)
def chunk(kind,data):
    return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
with output.open('xb') as f:
    f.write(b'\x89PNG\r\n\x1a\n')
    f.write(chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0)))
    f.write(chunk(b'IDAT',zlib.compress(b''.join(b'\0'+row.tobytes() for row in pixels),9)))
    f.write(chunk(b'IEND',b''))
print('LIP_RESPONSE',output.stat().st_size,hashlib.sha256(output.read_bytes()).hexdigest(),
      'R',int(pixels[:,:,0].min()),int(pixels[:,:,0].max()),'G',int(pixels[:,:,1].min()),int(pixels[:,:,1].max()))
