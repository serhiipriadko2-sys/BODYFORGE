"""Compare old/new disabled regional flag frames; decoded pixels, not PNG bytes."""
import bpy,numpy as np,hashlib,json
from pathlib import Path
root=Path.cwd()/'docs/audits'
old=root/'BF_AVATAR_METRIC_SKIN_20261127'
new=root/'BF_AVATAR_REGIONAL_MICRO_20261127'
def load(p):
    im=bpy.data.images.load(str(p),check_existing=False)
    im.colorspace_settings.name='Non-Color'
    w,h=im.size
    assert (w,h)==(780,1688)
    a=np.empty(w*h*4,np.float32);im.pixels.foreach_get(a);bpy.data.images.remove(im)
    return np.rint(a.reshape(h,w,4)*255).astype(np.int16)
r=[]
for level,b in [('max','hardware-max'),('neutral','on-neutral')]:
    for p in sorted((new/('metric-'+level)).glob('metric-*.png')):
        q=old/b/p.name
        same=hashlib.sha256(p.read_bytes()).digest()==hashlib.sha256(q.read_bytes()).digest()
        if same:changed=0;worst=0
        else:
            d=np.abs(load(p)-load(q))
            changed=int(np.any(d!=0,axis=2).sum());worst=int(d.max())
        r.append(dict(level=level,view=p.name,identicalBytes=same,changedPixels=changed,maxChannelDelta8bit=worst))
assert len(r)==12
with (new/'baseline-parity.json').open('x',encoding='utf8') as fp:json.dump(r,fp,indent=2)
print('BASELINE_PARITY',json.dumps(r),flush=True)
