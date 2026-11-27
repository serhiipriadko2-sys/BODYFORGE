"""Local research bake: bounded high-pass photo colour on the existing torso UV.
Source: Body scan by Artec 3D. Archive CC BY 3.0; website CC BY 4.0.
No raw photograph or donor identity copied to production. No claim of calibrated albedo.
Run with Blender background, --factory-startup --disable-autoexec.
"""
import bpy, numpy as np, pathlib, json, hashlib, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
root=pathlib.Path.cwd(); d=root/'.bodyforge-qa/scan-reference-artec'
audit=root/'docs/audits/BF_AVATAR_SCAN_QC_20261127'
source=d/'artec-reference.blend'
target=root/'public/assets/bodyforge-athlete-efficient.glb'
basefile=root/'public/assets/athlete-skin-perioral.jpg'
output=d/'torso-color-review-v1.png'
preview=audit/'torso-color-projection.png'
report=audit/'torso-color-bake.json'
for p,h in [(source,'55ee5fafccc58322f7c348c716f25365151a38e1234cf3ff0e77b358d0f6f602'),(target,'df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e'),(basefile,'8cb93dfdb95c20fcb73d5eb9b5e3f0f9e636855cf44733074cec259c87eb19c0')]:
    assert hashlib.sha256(p.read_bytes()).hexdigest()==h,p
assert not any(p.exists() for p in (output,preview,report))
def coords(o):
    a=np.empty(len(o.data.vertices)*3,np.float32);o.data.vertices.foreach_get('co',a)
    m=np.array(o.matrix_world,dtype=float)
    return a.reshape(-1,3)@m[:3,:3].T+m[:3,3]
def meshdata(o):
    m=o.data;m.calc_loop_triangles()
    faces=np.empty(len(m.loop_triangles)*3,np.int32);m.loop_triangles.foreach_get('vertices',faces)
    loops=np.array([t.loops[:] for t in m.loop_triangles],np.int32)
    uv=np.empty(len(m.loops)*2,np.float32);m.uv_layers.active.uv.foreach_get('vector',uv)
    mats=np.array([m.polygons[t.polygon_index].material_index for t in m.loop_triangles],np.int32)
    return faces.reshape(-1,3),uv.reshape(-1,2)[loops],mats
def tree(p,t):return BVHTree.FromPolygons(p.tolist(),t.tolist(),all_triangles=True)
def hit_uv(hit,points,uv):
    p=np.array(hit);a,b,c=points;u=b-a;v=c-a;w=p-a
    aa=u@u;ab=u@v;bb=v@v;den=aa*bb-ab*ab
    if den<1e-20:return None
    f=(bb*(u@w)-ab*(v@w))/den;g=(aa*(v@w)-ab*(u@w))/den
    if min(f,g,1-f-g)<-.003:return None
    return uv[0]+f*(uv[1]-uv[0])+g*(uv[2]-uv[0])
def bilinear(img,u,v):
    h,w=img.shape[:2]
    x=np.clip(np.asarray(u)*w-.5,0,w-1.00001);y=np.clip(np.asarray(v)*h-.5,0,h-1.00001)
    i=x.astype(int);j=y.astype(int);a=(x-i)[...,None];b=(y-j)[...,None]
    return (img[j,i]*(1-a)+img[j,i+1]*a)*(1-b)+(img[j+1,i]*(1-a)+img[j+1,i+1]*a)*b
def smooth(lo,hi,x):
    t=np.clip((x-lo)/(hi-lo),0,1);return t*t*(3-2*t)
def blur(a,sigma):
    r=math.ceil(3*sigma);x=np.arange(-r,r+1);k=np.exp(-.5*(x/sigma)**2);k/=k.sum()
    for axis in (0,1):
        a=np.apply_along_axis(lambda z:np.convolve(np.pad(z,r,mode='edge'),k,mode='valid'),axis,a)
    return a
def pixels(im):
    w,h=im.size;arr=np.empty(w*h*4,np.float32);im.pixels.foreach_get(arr);return arr.reshape(h,w,4)
def save_rgb(name,pix,path):
    h,w=pix.shape[:2];im=bpy.data.images.new(name,width=w,height=h,alpha=False)
    rgba=np.ones((h,w,4),np.float32);rgba[:,:,:3]=pix;im.pixels.foreach_set(rgba.ravel())
    im.filepath_raw=str(path);im.file_format='PNG';im.save();bpy.data.images.remove(im)
def mask(x,y,z,side):
    width=.137+.027*smooth(1.18,1.30,y)
    a=(1-smooth(width-.035,width,np.abs(x)))*smooth(1.05,1.11,y)*(1-smooth(1.35,1.43,y))
    if side==1:
        nipple=np.exp(-((np.abs(x)-.094)/.034)**2-((y-1.307)/.035)**2)
        navel=np.exp(-(x/.031)**2-((y-1.10)/.035)**2)
        a*= (1-smooth(.12,.65,nipple))*(1-smooth(.12,.65,navel))*smooth(.04,.085,z)
    else:a*=1-smooth(-.07,-.018,z)
    return a
bpy.ops.wm.open_mainfile(filepath=str(source),load_ui=False)
obj=next(o for o in bpy.data.objects if o.type=='MESH')
p=coords(obj);tri,uv,mats=meshdata(obj)
scale=1.7852068585925736/np.ptp(p[:,1])
# Previously verified proper rotation, height and waist-centre alignment.
y=(p[:,1].max()-p[:,1])*scale
p=np.column_stack((p[:,0]*scale,y,-p[:,2]*scale))
band=p[(y>1)&(y<1.18)];p[:,0]-=(np.quantile(band[:,0],.1)+np.quantile(band[:,0],.9))/2
donor=tree(p,tri)
im=next(i for i in bpy.data.images if i.name.endswith('Dima_body scan_1.png') and tuple(i.size)==(8192,8192))
assert im.packed_file
im.scale(4096,4096);photo=pixels(im)
assert np.isfinite(photo).all() and float(photo[:,:,:3].std())>.02
# Precompute donor lookup in a bounded spatial grid while the source is loaded.
W,H=360,400;xmin,xmax=-.18,.18;ymin,ymax=1.035,1.45
xs=np.linspace(xmin,xmax,W);ys=np.linspace(ymin,ymax,H)
fields={}
for side in (1,-1):
    c=np.zeros((H,W),np.float32);rgb=np.zeros((H,W,3),np.float32)
    for j,yy in enumerate(ys):
        yd=float(np.interp(yy,[1.01,1.10,1.31,1.47],[1.00,1.05,1.31,1.47]))
        for i,xx in enumerate(xs):
            if abs(xx)>.17:continue
            hit,n,idx,_=donor.ray_cast(Vector((float(xx*1.03),yd,float(side))),Vector((0,0,-side)),2.)
            if hit is None or n.z*side<.25 or mats[idx]!=0:continue
            tex=hit_uv(hit,p[tri[idx]],uv[idx])
            if tex is None:continue
            color=bilinear(photo,*tex)[:3]
            if not np.isfinite(color).all() or color.min()<.018 or color.max()>.98:continue
            rgb[j,i]=color;c[j,i]=smooth(.25,.7,n.z*side)
    log=np.log(np.maximum(rgb,.025))
    den=np.maximum(blur(c,13),1e-6)
    low=np.stack([blur(log[:,:,k]*c,13)/den for k in range(3)],axis=2)
    residual=np.clip(log-low,-.28,.28)
    # Retain local chromatic variation; reduce brightness contrast to suppress captured shadows.
    lum=residual@np.array([.2126,.7152,.0722])
    residual=residual-.35*lum[:,:,None]
    residual=np.clip(residual,-.22,.22)
    fields[side]={'confidence':c,'residual':residual.astype(np.float32)}
    print('DONOR_GRID',side,int(np.count_nonzero(c)),float(np.mean(np.abs(residual[c>.5]))),flush=True)
    assert np.count_nonzero(c>.5)>25000
del photo,donor,p,tri,uv,mats
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(target))
o=bpy.data.objects['BODYFORGE_Body'];p=coords(o)[:,[0,2,1]]*np.array([1,1,-1])
tri,uv,mats=meshdata(o);bt=tree(p,tri)
base=bpy.data.images.load(str(basefile),check_existing=False);old=pixels(base)
assert tuple(base.size)==(2048,2048)
# Target depth prevents copying pigment to hidden or unrelated overlapping surface.
for side in (1,-1):
    c=fields[side]['confidence'];r=fields[side]['residual']
    z=np.zeros_like(c);uview=np.full((H,W,2),-1.,np.float32)
    for j,yy in enumerate(ys):
        for i,xx in enumerate(xs):
            if c[j,i]<=0:continue
            hit,n,idx,_=bt.ray_cast(Vector((float(xx),float(yy),float(side))),Vector((0,0,-side)),2.)
            if hit is None or n.z*side<.25:c[j,i]=0;continue
            tex=hit_uv(hit,p[tri[idx]],uv[idx])
            if tex is None:c[j,i]=0;continue
            c[j,i]*=float(mask(xx,yy,hit.z,side)*smooth(.25,.6,n.z*side))
            z[j,i]=hit.z;uview[j,i]=tex
    fields[side]['packed']=np.concatenate([r*c[:,:,None],c[:,:,None],z[:,:,None]*c[:,:,None]],axis=2)
    fields[side]['uv']=uview
def sample_grid(a,x,y):
    u=((x-xmin)/(xmax-xmin)*(W-1)+.5)/W
    v=((y-ymin)/(ymax-ymin)*(H-1)+.5)/H
    return bilinear(a,u,v)
w=h=2048
weights=np.zeros((h,w),np.float32);delta=np.zeros((h,w,3),np.float32)
protected=np.zeros((h,w),bool)
# Rasterize all body triangles; veto any texel shared with a protected surface.
for n,(ids,tuv) in enumerate(zip(tri,uv)):
    pts=p[ids];tex=tuv*[w,h]-.5
    lo=np.maximum(0,np.ceil(tex.min(0)).astype(int));hi=np.minimum([w-1,h-1],np.floor(tex.max(0)).astype(int))
    if (hi<lo).any():continue
    e,f=tex[1]-tex[0],tex[2]-tex[0];det=e[0]*f[1]-e[1]*f[0]
    if abs(det)<1e-9:continue
    xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1),np.arange(lo[1],hi[1]+1))
    u=((xx-tex[0,0])*f[1]-(yy-tex[0,1])*f[0])/det
    v=(e[0]*(yy-tex[0,1])-e[1]*(xx-tex[0,0]))/det
    keep=(u>=-1e-7)&(v>=-1e-7)&(u+v<=1.0000001)
    if not keep.any():continue
    xi,yi=xx[keep],yy[keep];pos=pts[0]+u[keep,None]*(pts[1]-pts[0])+v[keep,None]*(pts[2]-pts[0])
    x,y,z=pos.T
    ok=(x>xmin)&(x<xmax)&(y>ymin)&(y<ymax)
    valid=np.zeros(len(x),bool)
    for side in (1,-1):
        loc=np.where(ok&(z*side>.018))[0]
        if not len(loc):continue
        g=sample_grid(fields[side]['packed'],x[loc],y[loc])
        c=g[:,3];safe=np.maximum(c,1e-7)
        wt=.90*np.minimum(mask(x[loc],y[loc],z[loc],side),c)*(1-smooth(.0009,.0035,abs(z[loc]-g[:,4]/safe)))
        use=(wt>1e-5)
        valid[loc[use]]=True
        better=use&(wt>weights[yi[loc],xi[loc]])
        sel=loc[better];weights[yi[sel],xi[sel]]=wt[better]
        delta[yi[sel],xi[sel]]=g[better,:3]/safe[better,None]
    protected[yi[~valid],xi[~valid]]=True
weights[protected]=0
before=old[:,:,:3].copy()
changed=weights>1e-5
count=int(changed.sum())
assert 15000<count<550000,count
old[:,:,:3]=np.clip(before*np.exp(delta*weights[:,:,None]),0,1)
assert np.array_equal(before[~changed],old[:,:,:3][~changed])
assert np.isfinite(old).all()
change=float(np.abs(before-old[:,:,:3])[changed].mean())
assert .001<change<.075,change
base.pixels.foreach_set(old.ravel());base.filepath_raw=str(output);base.file_format='PNG';base.save()
re=bpy.data.images.load(str(output),check_existing=False);after=pixels(re)
assert tuple(re.size)==(2048,2048) and output.stat().st_size<12_000_000
outside=np.abs(after[:,:,:3][~changed]-before[~changed])
assert float(outside.mean())<.003 and float(outside.max())<.025,(outside.mean(),outside.max())
# Render matched orthographic colour-only projections for review, not gameplay screenshots.
panels=[]
for side in (1,-1):
    f=fields[side];coords=f['uv'];ok=coords[:,:,0]>=0
    for atlas in (before,after[:,:,:3]):
        img=np.full((H,W,3),.045,np.float32)
        img[ok]=bilinear(atlas,coords[ok,0],coords[ok,1])
        panels.append(img)
save_rgb('Torso photo comparison',np.concatenate(panels,axis=1),preview)
stats={'status':'PASS','scope':'Local high-pass scan photo transfer only; no calibrated albedo or artistic acceptance','source':'Body scan by Artec 3D https://www.artec3d.com/3d-models/body-scan','license':'ZIP CC BY 3.0; page CC BY 4.0; do not distribute until resolved','texelsChanged':count,'protectedTexels':int(protected.sum()),'meanLinearChange':change,'maxWeight':float(weights.max()),'outsideReloadMean':float(outside.mean()),'outsideReloadMax':float(outside.max()),'dimensions':[w,h],'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'previewSha256':hashlib.sha256(preview.read_bytes()).hexdigest()}
with report.open('x',encoding='utf-8') as f:json.dump(stats,f,indent=2)
print('TORSO_COLOR_BAKE',json.dumps(stats),flush=True)
