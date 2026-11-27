"""Matched browser frame comparisons, with explicit scope and image provenance."""
import bpy,numpy as np,hashlib,json
from pathlib import Path
root=Path.cwd();a=root/'docs/audits/BF_AVATAR_GROOM_V3_20261127'
out=a/'matched-groom-comparison.png';receipt=a/'comparison.json'
assert not out.exists() and not receipt.exists()
def load(p):
    im=bpy.data.images.load(str(p),check_existing=False);w,h=im.size
    x=np.empty(w*h*4,np.float32);im.pixels.foreach_get(x);bpy.data.images.remove(im)
    assert (w,h)==(780,1688),(w,h)
    return x.reshape(h,w,4)[::-1,:,:3].copy()
def stats(A,B):
    delta=np.abs(A-B);return {'pixels':len(A)*A.shape[1],'changedPixels':int(np.any(delta>0,axis=2).sum()),'meanAbsoluteDecodedChannelDelta':float(delta.mean()),'maxDecodedChannelDelta':float(delta.max())}
rows=[];results=[]
for view in ['front','turned','swept','silver','buzz','deep','torso']:
    off=load(a/'off'/f'groom-off-{view}.png');on=load(a/'on'/f'groom-on-{view}.png');fallback=load(a/'fallback'/f'groom-fallback-{view}.png')
    crop=(245,610,560,960) if view!='torso' else (75,600,706,1132)
    x0,y0,x1,y1=crop
    A=off[y0:y1,x0:x1];B=on[y0:y1,x0:x1];C=fallback[y0:y1,x0:x1]
    result={'view':view,'crop':crop,'enabledVsOff':stats(A,B),'fallbackVsOff':stats(A,C)}
    results.append(result)
    if view in ('front','turned','swept','silver','buzz'):rows.append(np.concatenate([A,B,C],1))
pic=np.concatenate(rows,0)[::-1];h,w=pic.shape[:2];rgba=np.ones((h,w,4),np.float32);rgba[:,:,:3]=pic
im=bpy.data.images.new('Groom comparison actual frames',width=w,height=h,alpha=False);im.pixels.foreach_set(rgba.ravel());im.filepath_raw=str(out);im.file_format='PNG';im.save()
r={'scope':'Matched browser frame crops. Descriptive decoded channel differences, not photorealism score. No calibrated linear-light interpretation.','columns':'baseline V2, V3, fallback V2','rows':'front, turned, swept, silver, buzz','results':results,'comparisonBytes':out.stat().st_size,'comparisonSha256':hashlib.sha256(out.read_bytes()).hexdigest()}
with receipt.open('x',encoding='utf-8') as fp:json.dump(r,fp,indent=2)
print('MATCHED_GROOM',json.dumps(r),flush=True)
