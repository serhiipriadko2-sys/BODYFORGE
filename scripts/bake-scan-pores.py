"""Create a seamless high-frequency height tile from a licensed head scan.
Run with Blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python scripts/bake-scan-pores.py -- INPUT OUTPUT.
Source: Infinite 3D Head Scan, Lee Perry-Smith / Infinite-Realities,
CC BY 3.0 (see public/assets/athlete-scan-source.md).
Only local cheek microrelief is retained; no source face shape or albedo.
"""
from pathlib import Path
import hashlib
import sys
import bpy
import numpy as np

source, output = (Path(arg).resolve() for arg in sys.argv[sys.argv.index('--') + 1:])
assert hashlib.sha256(source.read_bytes()).hexdigest() == '937dea3ab1adea4624c9743ea0653fcb022235e6dcdebfb6e739b93f9d2a5cef'
if output.exists():
    raise FileExistsError(output)

image = bpy.data.images.load(str(source))
image.colorspace_settings.name = 'Non-Color'
w, h = image.size
assert (w,h) == (4096,4096), (w,h)
pixels = np.empty(w*h*4,dtype=np.float32)
image.pixels.foreach_get(pixels)
# Blender pixel coordinates start at bottom left. This crop is in the donor
# cheek, clear of the eyes, mouth, nose and ear; top-left source coordinates.
x, y, size, overlap = 1250, 1420, 320, 64
patch = pixels.reshape(h,w,4)[h-y-size:h-y, x:x+size,0].copy()
del pixels
# Remove broad head curvature and facial features, keep measured microrelief.
def gaussian_blur(a, sigma):
    r = int(3*sigma)
    k = np.exp(-.5*(np.arange(-r,r+1)/sigma)**2)
    k /= k.sum()
    a = np.apply_along_axis(lambda v: np.convolve(np.pad(v,r,mode='reflect'),k,mode='valid'),0,a)
    return np.apply_along_axis(lambda v: np.convolve(np.pad(v,r,mode='reflect'),k,mode='valid'),1,a)

# A small low-pass suppresses JPEG quantization; a wide low-pass removes shape.
detail = gaussian_blur(patch,.85) - gaussian_blur(patch,10.0)
period = size-overlap
ramp = .5-.5*np.cos(np.pi*(np.arange(overlap)+.5)/overlap)
weight = np.ones(size)
weight[:overlap] = ramp
weight[-overlap:] = 1-ramp
weights = weight[:,None]*weight[None,:]
tile = np.zeros((period,period))
denom = np.zeros_like(tile)
yy, xx = np.indices((size,size))
np.add.at(tile,(yy%period,xx%period),detail*weights)
np.add.at(denom,(yy%period,xx%period),weights)
tile /= denom
tile -= np.median(tile)
scale = np.percentile(np.abs(tile),97)
assert scale > .0005, scale
tile = np.clip(.5+.22*tile/scale,.15,.85)
assert np.isfinite(tile).all() and tile.std()>.035
# Save directly as non-color data; no AgX, tone mapping or gamma transform.
out = bpy.data.images.new('BODYFORGE_scan_microrelief',width=period,height=period,alpha=False,float_buffer=False)
out.colorspace_settings.name = 'Non-Color'
rgba = np.ones((period,period,4),dtype=np.float32)
rgba[:,:,:3] = tile[:,:,None]
out.pixels.foreach_set(rgba.ravel())
out.filepath_raw = str(output)
out.file_format = 'PNG'
out.save()
print('SCAN_PORES',output.stat().st_size,hashlib.sha256(output.read_bytes()).hexdigest(),
      'std',float(tile.std()),'crop',x,y,size,'period',period)
