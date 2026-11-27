"""Matched actual browser screenshots. Descriptive channel statistics, not a photorealism score."""
import bpy,numpy as np,json,hashlib
from pathlib import Path
audit=Path.cwd()/'docs/audits/BF_AVATAR_SHOULDER_TRANSITION_20261127'
out=audit/'comparison.json'
assert not out.exists()
def load(p):
    im=bpy.data.images.load(str(p),check_existing=False)
    im.colorspace_settings.name='Non-Color'
    w,h=im.size
    assert (w,h)==(780,1688),(p,w,h)
    a=np.empty(w*h*4,np.float32);im.pixels.foreach_get(a);bpy.data.images.remove(im)
    return a.reshape(h,w,4)[::-1,:,:3].copy()
def stats(A,B):
    delta=np.abs(A-B)
    return dict(pixels=A.shape[0]*A.shape[1],changedPixels=int(np.any(delta>0,axis=2).sum()),
                changedAbove2Over255=int(np.any(delta>2.01/255,axis=2).sum()),
                meanAbsoluteDecodedChannelDelta=float(delta.mean()),maxDecodedChannelDelta=float(delta.max()))
def save(A,path):
    assert not path.exists()
    h,w=A.shape[:2];rgba=np.ones((h,w,4),np.float32);rgba[:,:,:3]=A[::-1]
    im=bpy.data.images.new(path.stem,width=w,height=h,alpha=False)
    im.colorspace_settings.name='Non-Color';im.pixels.foreach_set(rgba.ravel())
    im.filepath_raw=str(path);im.file_format='PNG';im.save();bpy.data.images.remove(im)
    return dict(path=path.name,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest())

groups={'portrait':['portrait-front','portrait-turned'],'torso':['torso-front','torso-rear'],'shirt':['shirt-front','shirt-rear'],'legs':['legs-front','legs-rear']}
pairs=[];sheets=[]
for level in ['max','neutral']:
    for group,views in groups.items():
        rows=[]
        for v in views:
            a=load(audit/('browser-off-'+level)/('metric-'+v+'.png'))
            b=load(audit/('browser-on-'+level)/('metric-'+v+'.png'))
            x0,y0,x1,y1=74,470,706,1132
            a1,b1=a[y0:y1,x0:x1],b[y0:y1,x0:x1]
            pairs.append(dict(level=level,view=v,crop=[x0,y0,x1,y1],avatarCrop=stats(a1,b1),fullFrame=stats(a,b)))
            rows.append(np.concatenate([a1,b1],1))
        sheets.append(save(np.concatenate(rows,0),audit/('matched-shoulder-'+level+'-'+group+'.png')))
r=dict(scope='Actual matched hardware screenshots. Pose and weights changed; pixel deltas not realism scores.',columns='left baseline, right candidate',pairs=pairs,sheets=sheets)
with out.open('x',encoding='utf-8') as fp:json.dump(r,fp,indent=2)
print('SHOULDER_COMPARISON_PASS',len(pairs),len(sheets),flush=True)
