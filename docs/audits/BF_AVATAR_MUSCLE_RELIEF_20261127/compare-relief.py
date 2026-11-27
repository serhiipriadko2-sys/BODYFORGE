"""Descriptive comparison of matched actual browser renders, not realism scoring."""
import bpy,numpy as np,hashlib,json
from pathlib import Path
audit=Path.cwd()/'docs/audits/BF_AVATAR_MUSCLE_RELIEF_20261127'
receipt=audit/'comparison.json'
assert not receipt.exists()
def load(p):
    im=bpy.data.images.load(str(p),check_existing=False);w,h=im.size
    x=np.empty(w*h*4,np.float32);im.pixels.foreach_get(x);bpy.data.images.remove(im)
    assert (w,h)==(780,1688),(w,h)
    return x.reshape(h,w,4)[::-1,:,:3].copy()
def stats(A,B):
    delta=np.abs(A-B)
    return {'pixels':len(A)*A.shape[1],'changedPixels':int(np.any(delta>0,axis=2).sum()),
            'changedAbove2Over255':int(np.any(delta>2.01/255,axis=2).sum()),
            'meanAbsoluteDecodedChannelDelta':float(delta.mean()),'maxDecodedChannelDelta':float(delta.max())}
def save_image(p,path):
    assert not path.exists()
    pic=p[::-1];h,w=pic.shape[:2];rgba=np.ones((h,w,4),np.float32);rgba[:,:,:3]=pic
    im=bpy.data.images.new(path.stem,width=w,height=h,alpha=False);im.pixels.foreach_set(rgba.ravel())
    im.filepath_raw=str(path);im.file_format='PNG';im.save();bpy.data.images.remove(im)
    return {'path':path.name,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
views=['bare-front','bare-rear','shirt-front','shirt-rear','legs-front','legs-rear']
results=[];sheets=[]
for level in ['max','neutral']:
    rows=[]
    for view in views:
        A=load(audit/('off-'+level)/('wardrobe-'+level+'-'+view+'.png'))
        B=load(audit/('on-'+level)/('wardrobe-'+level+'-'+view+'.png'))
        # Same crop for both levels and both candidate modes. Exclude dynamic UI.
        crop=(160,575,620,1130) if not view.startswith('legs') else (160,545,620,1100)
        x0,y0,x1,y1=crop
        a=A[y0:y1,x0:x1];b=B[y0:y1,x0:x1]
        r={'level':level,'view':view,'crop':crop,'avatarCrop':stats(a,b),'fullFrame':stats(A,B)}
        results.append(r)
        if view in ['bare-front','bare-rear','legs-front','legs-rear']:rows.append(np.concatenate([a,b],1))
    pic=np.concatenate(rows,0)
    sheets.append(save_image(pic,audit/('matched-relief-'+level+'.png')))
r={'scope':'Actual matched browser frame crops. Descriptive decoded differences only, not a calibrated visual or clinical score.',
   'columns':'V2 growth only, V2 plus V1 oriented relief','rows':'front torso, rear torso, front legs, rear legs','results':results,'sheets':sheets}
with receipt.open('x',encoding='utf-8') as fp:json.dump(r,fp,indent=2)
print('MATCHED_RELIEF',json.dumps(r),flush=True)
