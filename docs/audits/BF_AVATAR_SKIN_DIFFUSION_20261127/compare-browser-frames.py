import bpy,numpy as np,json,hashlib
from pathlib import Path
a=Path.cwd()/'docs/audits/BF_AVATAR_SKIN_DIFFUSION_20261127'
out=a/'diffusion-comparison.png';rfile=a/'pixel-comparison.json'
assert not out.exists() and not rfile.exists()
def load(p):
    im=bpy.data.images.load(str(p),check_existing=False);w,h=im.size
    x=np.empty(w*h*4,np.float32);im.pixels.foreach_get(x)
    bpy.data.images.remove(im)
    return x.reshape(h,w,4)[::-1,:,:3].copy()
rows=[];results=[]
for view in ['front','turned','deep','torso']:
    off=load(a/'off'/f'diffusion-off-{view}.png')
    on=load(a/'on'/f'diffusion-on-{view}.png')
    assert off.shape==on.shape
    h,w,_=off.shape;assert (w,h)==(780,1688),(w,h)
    # Fixed crop of the viewport, including background, not a skin segmentation.
    x0,x1,y0,y1=75,706,600,1132
    A=off[y0:y1,x0:x1];B=on[y0:y1,x0:x1]
    d=np.abs(A-B)
    results.append(dict(view=view,viewportCrop=[x0,y0,x1,y1],changedPixels=int(np.any(d>0,axis=2).sum()),pixels=d.shape[0]*d.shape[1],meanAbsoluteLinearDelta=float(d.mean()),p95MaxChannelDelta=float(np.quantile(d.max(2),.95)),maxDelta=float(d.max())))
    if view in ('front','turned'):rows.append(np.concatenate([A,B],1))
pic=np.concatenate(rows,0)[::-1]
h,w=pic.shape[:2];rgba=np.ones((h,w,4),np.float32);rgba[:,:,:3]=pic
im=bpy.data.images.new('Browser A-B actual',width=w,height=h,alpha=False);im.pixels.foreach_set(rgba.ravel());im.filepath_raw=str(out);im.file_format='PNG';im.save()
r=dict(scope='Same scripted QA scenarios, fixed viewport crop with background; differences are descriptive, not a photorealism score.',rows='front, turned',columns='baseline off, diffusion on',results=results,comparisonBytes=out.stat().st_size,comparisonSha256=hashlib.sha256(out.read_bytes()).hexdigest())
with rfile.open('x',encoding='utf-8') as fp:json.dump(r,fp,indent=2)
print(json.dumps(r),flush=True)
