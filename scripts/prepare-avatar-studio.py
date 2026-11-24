"""Prepare a small linear HDR studio environment from Poly Haven CC0.
Source: Studio Small 03 by Greg Zaal, https://polyhaven.com/a/studio_small_03.
Run Blender -b --factory-startup --disable-autoexec --python-exit-code 1
 --python scripts/prepare-avatar-studio.py -- INPUT.hdr OUTPUT.hdr
"""
from pathlib import Path
import hashlib
import sys
import bpy
import numpy as np

source, output = (Path(arg).resolve() for arg in sys.argv[sys.argv.index('--')+1:])
assert hashlib.sha256(source.read_bytes()).hexdigest() == '30933d55e45f0795daf49f3cbeFbe0e5ebcb821ee04fb0a2818c02ffc3938817'.lower()
if output.exists():
    raise FileExistsError(output)
image = bpy.data.images.load(str(source))
w,h = image.size
assert (w,h) == (1024,512)
a=np.empty(w*h*4,dtype=np.float32)
image.pixels.foreach_get(a)
rgb=a.reshape(h,w,4)[:,:,:3]
assert np.isfinite(rgb).all() and rgb.min() >= 0
# Area-average in linear light, not gamma-encoded display space.
rgb=rgb.reshape(h//2,2,w//2,2,3).mean(axis=(1,3))
luma=np.array([.2126,.7152,.0722],dtype=np.float32)
latitude=(np.arange(h//2)+.5)/(h//2)*np.pi
weights=np.sin(latitude)[:,None]
mean=float((rgb@luma*weights).sum()/(weights.sum()*(w//2)))
assert mean>0
rgb/=mean
# Limit isolated highlight energy to avoid overpowering the analytic key.
# Keep HDR (not clipped at display white) and preserve chromatic ratios.
rgb*=np.minimum(1,32/np.maximum(rgb@luma,1e-6))[:,:,None]
print('source mean',mean,'output peak',float(rgb.max()),'mean',float((rgb@luma*weights).sum()/(weights.sum()*(w//2))))
# Encode Radiance RGBE directly. Blender's image.save applies a view
# transform even to this generated float image; it would destroy HDR energy.
peak=rgb.max(axis=2)
mantissa,exponent=np.frexp(peak)
scale=np.divide(mantissa*256,peak,out=np.zeros_like(peak),where=peak>1e-32)
rgbe=np.zeros((h//2,w//2,4),dtype=np.uint8)
rgbe[:,:,:3]=np.clip(rgb*scale[:,:,None],0,255).astype(np.uint8)
rgbe[:,:,3]=np.where(peak>1e-32,exponent+128,0).astype(np.uint8)
def encode_channel(channel):
    data=bytearray()
    i=0
    while i<len(channel):
        run=1
        while i+run<len(channel) and run<127 and channel[i+run]==channel[i]:
            run+=1
        if run>=4:
            data.extend((128+run,int(channel[i])))
            i+=run
        else:
            start=i
            i+=run
            while i<len(channel) and i-start<128:
                if i+3<len(channel) and len(set(channel[i:i+4]))==1: break
                i+=1
            data.append(i-start)
            data.extend(channel[start:i].tobytes())
    return data
with output.open('xb') as f:
    f.write(f'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y {h//2} +X {w//2}\n'.encode('ascii'))
    for row in rgbe[::-1]:
        f.write(bytes((2,2,(w//2)>>8,(w//2)&255)))
        for channel in range(4):
            f.write(encode_channel(row[:,channel]))
assert output.stat().st_size<600000
print('STUDIO_HDR',output.stat().st_size,hashlib.sha256(output.read_bytes()).hexdigest())
