"""Prepare CC0 Poly Haven bi_stretch maps for a small mobile material.

Run with Blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python scripts/prepare-athlete-fabric.py --
NORMAL ROUGHNESS OUT_NORMAL OUT_ROUGHNESS
"""
from pathlib import Path
import hashlib
import sys
import bpy
import numpy as np

normal, rough, out_normal, out_rough = (Path(arg).resolve() for arg in sys.argv[sys.argv.index('--') + 1:])
assert hashlib.sha256(normal.read_bytes()).hexdigest() == 'b282a065f0fc027e375c2cfe35a6344b18d9e7154f3f7b3604ab9c7fdf6e6b1a'
assert hashlib.sha256(rough.read_bytes()).hexdigest() == '06ade3abeb3c08c6dd96c396757ca18d2e0cd1e5d6819ae4a585dc265ae9f3ee'
if out_normal.exists() or out_rough.exists():
    raise FileExistsError('Output already exists; use fresh paths')

def load(path):
    image = bpy.data.images.load(str(path))
    image.colorspace_settings.name = 'Non-Color'
    assert tuple(image.size) == (1024,1023)
    image.scale(512,512)
    a = np.empty(512*512*4,dtype=np.float32)
    image.pixels.foreach_get(a)
    return image, a.reshape(512,512,4)

def save(image, a, path):
    assert np.isfinite(a).all()
    image.pixels.foreach_set(a.ravel())
    image.filepath_raw = str(path)
    image.file_format = 'JPEG'
    image.save(quality=94)
    print(path.name,path.stat().st_size,hashlib.sha256(path.read_bytes()).hexdigest())

image, a = load(normal)
v = a[:,:,:3]*2-1
v /= np.maximum(np.linalg.norm(v,axis=2,keepdims=True),1e-6)
a[:,:,:3] = np.clip(v*.5+.5,0,1)
print('normal_xy_std',float(v[:,:,:2].std()))
save(image,a,out_normal)

image, a = load(rough)
r = a[:,:,0]
# Keep measured spatial variation, bound the artistic response to avoid shiny plastic.
r = np.clip(.62+(r-np.median(r))*.65,.48,.84)
a[:,:,:3] = r[:,:,None]
print('roughness_range',float(r.min()),float(r.max()),'std',float(r.std()))
save(image,a,out_rough)
