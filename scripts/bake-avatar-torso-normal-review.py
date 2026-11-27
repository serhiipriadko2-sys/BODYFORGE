"""Local mesoscopic scan normal review, using measured depth residuals.
Body scan by Artec 3D (archive CC BY 3.0; page CC BY 4.0).
No new production geometry; no calibrated pore or optical measurement claim.
"""
import bpy,numpy as np,pathlib,json,hashlib,math,struct,zlib
root=pathlib.Path.cwd();d=root/'.bodyforge-qa/scan-reference-artec';audit=root/'docs/audits/BF_AVATAR_SCAN_QC_20261127'
src=d/'torso-depth-surfaces.npz';asset=root/'public/assets/bodyforge-athlete-efficient.glb'
oldfile=root/'public/assets/athlete-face-relief-normal.png';photo=d/'torso-color-review-v1.png'
review=root/'.bodyforge-qa/scan-torso-review.blend';out=d/'torso-normal-review-v1.png'
blend=root/'.bodyforge-qa/scan-torso-textured-review.blend';report=audit/'torso-normal-bake.json'
pins={src:'ee2f38c97d61ba284a252abb425c4bba189c76abe0a63b499598325ad696d869',asset:'df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e',oldfile:'1740a2f83974d90745684454302d65951ebbaee ca8cb275f5e528a139251c830'.replace(' ',''),photo:'d36c1235f1adaf4bd5e32fadf641d2b225c38a27eaf147ac070000545208e364',review:'4e3aaf461cef28c28545a7fc678a463225562e47aeb9093e055f37a6fbea09e6'}
for p,h in pins.items():assert hashlib.sha256(p.read_bytes()).hexdigest()==h,p
assert not any(p.exists() for p in (out,blend,report))
data=np.load(src,allow_pickle=False)
step=.002;xmin,ymin=-.18,1.03
xs=xmin+np.arange(181)*step;ys=ymin+np.arange(211)*step
X,Y=np.meshgrid(xs,ys);Yd=np.interp(Y,[1.01,1.10,1.31,1.47],[1.00,1.05,1.31,1.47])
def smooth(a,b,t):
    t=np.clip((t-a)/(b-a),0,1);return t*t*(3-2*t)
def blur(a,sigma):
    r=math.ceil(3*sigma);x=np.arange(-r,r+1);k=np.exp(-.5*(x/sigma)**2);k/=k.sum()
    for axis in (0,1):a=np.apply_along_axis(lambda t:np.convolve(np.pad(t,r,mode='edge'),k,mode='valid'),axis,a)
    return a
def sample(a,gx,gy):
    valid=(gx>=0)&(gy>=0)&(gx<a.shape[1]-1)&(gy<a.shape[0]-1)
    gx=np.clip(gx,0,a.shape[1]-1.00001);gy=np.clip(gy,0,a.shape[0]-1.00001)
    i=gx.astype(int);j=gy.astype(int);u=gx-i;v=gy-j
    q00,q01,q10,q11=a[j,i],a[j,i+1],a[j+1,i],a[j+1,i+1]
    if a.ndim==3:u=u[:,None];v=v[:,None];valid=valid[:,None]
    return np.where(valid,((1-u)*q00+u*q01)*(1-v)+((1-u)*q10+u*q11)*v,np.nan)
def depth(a,x,y):return sample(a,(x+.29)/.58*239,(y-1.)/.53*249)
width=.135+.027*smooth(1.18,1.30,Y)
mask=(1-smooth(width-.035,width,np.abs(X)))*smooth(1.055,1.11,Y)*(1-smooth(1.35,1.43,Y))
fields={};summary={}
for side in ('front','back'):
    residual=depth(data['donor_'+side],X*1.03,Yd)-depth(data['target_'+side],X,Y)
    good=np.isfinite(residual);a=np.where(good,residual,0)
    def lp(s):return blur(a,s)/np.maximum(blur(good.astype(float),s),1e-7)
    # 2–8 mm band, separated from the broader 10 mm geometry field.
    factor=mask.copy()
    if side=='front':
        nipple=np.exp(-((np.abs(X)-.094)/.033)**2-((Y-1.307)/.034)**2)
        navel=np.exp(-(X/.032)**2-((Y-1.10)/.036)**2)
        factor*= (1-smooth(.12,.65,nipple))*(1-smooth(.12,.65,navel))
    relief=np.clip((lp(.9)-lp(4.5))*1.25,-.0014,.0014)*factor*smooth(.7,.98,blur(good.astype(float),2))
    relief=blur(relief,.85);relief[[0,1,-2,-1],:]=0;relief[:,[0,1,-2,-1]]=0
    gy,gx=np.gradient(relief,step,step);mag=np.hypot(gx,gy)
    gain=np.minimum(1,.32/np.maximum(mag,1e-9));gx*=gain;gy*=gain
    fields[side]=np.stack((gx,gy),axis=2)
    summary[side]={'validDepthSamples':int(good.sum()),'peakReliefMm':float(np.max(np.abs(relief))*1000),'maxSlope':float(np.hypot(gx,gy).max()),'rmsSlope':float(np.sqrt(np.mean(gx*gx+gy*gy)))}
    assert summary[side]['rmsSlope']>.004
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(asset));o=bpy.data.objects['BODYFORGE_Body'];m=o.data
assert len(m.vertices)==65895
m.calc_loop_triangles();m.calc_tangents(uvmap=m.uv_layers.active.name)
p=np.array([v.co[:] for v in m.vertices]);p=p[:,[0,2,1]]*np.array([1,1,-1])
normals=np.array([v.vector[:] for v in m.corner_normals]);normals=normals[:,[0,2,1]]*np.array([1,1,-1])
tangent=np.array([l.tangent[:] for l in m.loops]);tangent=tangent[:,[0,2,1]]*np.array([1,1,-1])
sign=np.array([l.bitangent_sign for l in m.loops])
uv=np.array([v.vector[:] for v in m.uv_layers.active.uv])
im=bpy.data.images.load(str(oldfile));im.colorspace_settings.name='Non-Color';w,h=im.size
assert (w,h)==(1024,1024)
raw=np.empty(w*h*4,np.float32);im.pixels.foreach_get(raw)
original=np.rint(raw.reshape(h,w,4)[:,:,:3]*255).astype(np.uint8)
result=original.copy();best=np.zeros((h,w),np.float32);protected=np.zeros((h,w),bool)
def unit(a):return a/np.maximum(np.linalg.norm(a,axis=1,keepdims=True),1e-10)
max_angle=0.
for triangle in m.loop_triangles:
    ids=list(triangle.vertices);loops=list(triangle.loops)
    pts=p[ids];tex=uv[loops]*[w,h]-.5
    lo=np.maximum(0,np.ceil(tex.min(0)).astype(int));hi=np.minimum([w-1,h-1],np.floor(tex.max(0)).astype(int))
    if (hi<lo).any():continue
    e,f=tex[1]-tex[0],tex[2]-tex[0];det=e[0]*f[1]-e[1]*f[0]
    if abs(det)<1e-9:continue
    xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1),np.arange(lo[1],hi[1]+1))
    u=((xx-tex[0,0])*f[1]-(yy-tex[0,1])*f[0])/det;v=(e[0]*(yy-tex[0,1])-e[1]*(xx-tex[0,0]))/det
    keep=(u>=-1e-7)&(v>=-1e-7)&(u+v<=1.0000001)
    if not keep.any():continue
    xi,yi=xx[keep],yy[keep];bc=np.column_stack((1-u[keep]-v[keep],u[keep],v[keep]))
    xyz=bc@pts;x,y,z=xyz.T
    N=unit(bc@normals[loops]);T=bc@tangent[loops];T=unit(T-N*np.sum(T*N,axis=1)[:,None]);B=np.cross(N,T)*np.sign(bc@sign[loops])[:,None]
    valid=np.zeros(len(x),bool)
    for side,s in [('front',1),('back',-1)]:
        sel=np.where((np.abs(x)<.17)&(y>1.04)&(y<1.44)&(z*s>.04)&(N[:,2]*s>.25))[0]
        if not len(sel):continue
        q=sample(fields[side],(x[sel]-xmin)/step,(y[sel]-ymin)/step)
        quality=smooth(.25,.65,N[sel,2]*s)*smooth(.04,.075,z[sel]*s)
        mag=np.linalg.norm(q,axis=1);good=np.isfinite(q).all(1)&(quality>.02)
        valid[sel[good]]=True
        use=good&(quality>best[yi[sel],xi[sel]])&(mag>1e-5)
        sel=sel[use];q=q[use]*quality[use,None]
        if not len(sel):continue
        base=unit(original[yi[sel],xi[sel]].astype(float)/127.5-1)
        world=T[sel]*base[:,0,None]+B[sel]*base[:,1,None]+N[sel]*base[:,2,None]
        new=world.copy();new[:,:2]-=q*world[:,2,None];new=unit(new)
        projected=unit(np.column_stack((np.sum(new*T[sel],1),np.sum(new*B[sel],1),np.sum(new*N[sel],1))))
        assert np.isfinite(projected).all()
        max_angle=max(max_angle,float(np.degrees(np.arccos(np.clip(np.sum(projected*base,1),-1,1))).max()))
        result[yi[sel],xi[sel]]=np.rint(np.clip((projected+1)*127.5,0,255)).astype(np.uint8)
        best[yi[sel],xi[sel]]=quality[use]
    protected[yi[~valid],xi[~valid]]=True
result[protected]=original[protected]
changed=np.any(result!=original,2);count=int(changed.sum())
assert 5000<count<200000,count
assert max_angle<26,max_angle
assert np.array_equal(result[protected],original[protected])
def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
with out.open('xb') as fp:
    fp.write(b'\x89PNG\r\n\x1a\n');fp.write(chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0)))
    fp.write(chunk(b'IDAT',zlib.compress(b''.join(b'\0'+row.tobytes() for row in result[::-1]),9)));fp.write(chunk(b'IEND',b''))
check=bpy.data.images.load(str(out),check_existing=False);check.colorspace_settings.name='Non-Color'
assert tuple(check.size)==(w,h)
a=np.empty(w*h*4,np.float32);check.pixels.foreach_get(a)
assert np.array_equal(np.rint(a.reshape(h,w,4)[:,:,:3]*255).astype(np.uint8),result)
# Attach both local maps to a separate packed Blender review, preserve original rig/shape keys.
bpy.ops.wm.open_mainfile(filepath=str(review),load_ui=False)
o=bpy.data.objects['BODYFORGE_Body']
mat=bpy.data.materials.new('BF Scan Torso Texture Review (local)');mat.use_nodes=True
nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
color=bpy.data.images.load(str(photo),check_existing=False);color.colorspace_settings.name='sRGB';color.pack()
normal=bpy.data.images.load(str(out),check_existing=False);normal.colorspace_settings.name='Non-Color';normal.pack()
c=nodes.new('ShaderNodeTexImage');c.image=color;links.new(c.outputs['Color'],bsdf.inputs['Base Color'])
n=nodes.new('ShaderNodeTexImage');n.image=normal;nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.65
links.new(n.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bsdf.inputs['Normal'])
bsdf.inputs['Roughness'].default_value=.52
bsdf.inputs['Subsurface Weight'].default_value=.065
o.data.materials.clear();o.data.materials.append(mat)
scene=bpy.context.scene;scene['BF_review']='Local scan photo and measured mesoscopic normal residual; approximated registration, not calibrated albedo/SSS.'
scene['BF_source']='Body scan by Artec 3D https://www.artec3d.com/3d-models/body-scan; archive CC BY 3.0; page CC BY 4.0.'
assert len(o.data.shape_keys.key_blocks)==8
bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
stats={'status':'PASS','scope':'Scan-informed 2–8mm depth band composed analytically into the existing 1024 tangent-space atlas; approximate local registration, not pore scan','fields':summary,'changedTexels':count,'protectedTexels':int(protected.sum()),'maxNormalAngleDegrees':max_angle,'dimensions':[w,h],'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'blendBytes':blend.stat().st_size,'blendSha256':hashlib.sha256(blend.read_bytes()).hexdigest()}
with report.open('x',encoding='utf-8') as f:json.dump(stats,f,indent=2)
print('TORSO_NORMAL_BAKE',json.dumps(stats),flush=True)
