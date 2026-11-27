"""Matched actual browser screenshots. Descriptive channel statistics, not a photorealism score."""
import bpy,numpy as np,json,hashlib
from pathlib import Path
audit=Path.cwd()/'docs/audits/BF_AVATAR_METRIC_SKIN_20261127'
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
views=['portrait-front','portrait-turned','torso-front','torso-rear','legs-front','legs-rear']
crops={v:(74,640,706,1132) if v.startswith('portrait') else (74,575,706,1132) if v.startswith('torso') else (74,520,706,1132) for v in views}
pairs=[];sheets=[]
for level in ['max','neutral']:
    rows={'portrait':[],'body':[]}
    for v in views:
        a=load(audit/('off-'+level)/('metric-'+v+'.png'))
        b=load(audit/('on-'+level)/('metric-'+v+'.png'))
        x0,y0,x1,y1=crops[v]
        a1,b1=a[y0:y1,x0:x1],b[y0:y1,x0:x1]
        pairs.append(dict(level=level,view=v,crop=crops[v],avatarCrop=stats(a1,b1),fullFrame=stats(a,b)))
        rows['portrait' if v.startswith('portrait') else 'body'].append(np.concatenate([a1,b1],1))
    for k,row in rows.items():
        sheets.append(save(np.concatenate(row,0),audit/('matched-metric-'+level+'-'+k+'.png')))
    # Same fixed cheek and shoulder crops, no claim of anatomical segmentation.
    a=load(audit/('off-'+level)/'metric-portrait-front.png')
    b=load(audit/('on-'+level)/'metric-portrait-front.png')
    for region,(x0,y0,x1,y1) in {'cheek':(347,795,378,828),'upper_chest':(305,970,475,1050)}.items():
        def hf(im):
            x=im[y0:y1,x0:x1].astype(np.float64).mean(axis=2)
            return float(np.sqrt((np.mean(np.diff(x,axis=0)**2)+np.mean(np.diff(x,axis=1)**2))*.5))
        pairs.append(dict(level=level,view='portrait-front',region=region,crop=[x0,y0,x1,y1],
                          decodedLocalNeighborRms={'off':hf(a),'on':hf(b)},avatarCrop=stats(a[y0:y1,x0:x1],b[y0:y1,x0:x1])))
r=dict(scope='Matched actual screenshot crops. Decoded channel differences and local finite differences, not calibrated linear radiance, biological measurements, or realism score.',
       columns='left old UV microrelief, right metric gradient review',portraitRows='front, turned',bodyRows='front torso, rear torso, front legs, rear legs',pairs=pairs,sheets=sheets)
with out.open('x',encoding='utf-8') as fp:json.dump(r,fp,indent=2)
print('METRIC_COMPARISON',json.dumps(r),flush=True)
