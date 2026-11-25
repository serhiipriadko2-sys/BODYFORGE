"""Bake bounded authored facial relief from a real subdivided surface.

Blender -b --factory-startup --disable-autoexec --python-exit-code 1
 --python scripts/bake-avatar-face-relief.py -- BODY_GLB FACE_PROFILE OLD_NORMAL OUTPUT_PNG OUTPUT_BLEND
Not a scan or medical model. No production topology, rig, UV or albedo change.
"""
import hashlib, importlib.util, json, math, struct, sys, zlib
from pathlib import Path
import bpy
import numpy as np

source, profile_path, normal_path, output, blend = (Path(s).resolve() for s in sys.argv[sys.argv.index('--')+1:])
assert hashlib.sha256(source.read_bytes()).hexdigest() == 'df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e'
assert hashlib.sha256(profile_path.read_bytes()).hexdigest() == 'e51dc7b5631443400da7e04022aa9bf696b27a99ebec200c531e87390dc243f9'
assert hashlib.sha256(normal_path.read_bytes()).hexdigest() == 'e95565df62af0349a6bfeb266f505ee23e0789bcb3f83fee0ae9c84c718ed67c'
if output.exists() or blend.exists(): raise FileExistsError('Use fresh output paths')
profile = json.loads(profile_path.read_text(encoding='utf8'))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
low = bpy.data.objects['BODYFORGE_Body']
assert len(low.data.vertices) == 65895
for obj in list(bpy.data.objects):
    if obj != low: bpy.data.objects.remove(obj, do_unlink=True)
low.modifiers.clear()
mesh = low.data
# Reconstruct the same Face V2 deformed position and inverse-transpose normal.
p = np.array([[v.co.x,v.co.z,-v.co.y] for v in mesh.vertices])
n = np.array([[v.vector.x,v.vector.z,-v.vector.y] for v in mesh.corner_normals])
loop_vertices = np.array([loop.vertex_index for loop in mesh.loops])
x,y,z = p.T
side = np.where(x < 0,-1.,1.)
eligible = (y>=1.55)&(y<=1.72)&(np.abs(x)<=.08)&(z>=.075)
delta = np.zeros_like(p)
jac = np.tile(np.eye(3),(len(p),1,1))
for zone in profile['zones']:
    cx,cy,cz=zone['center'];rx,ry,rz=zone['radius'];ox,oy,oz=zone['offset']
    u=(x-side*cx)/rx;v=(y-cy)/ry;w=(z-cz)/rz
    q=np.maximum(0,1-u*u-v*v-w*w)*eligible
    d=np.column_stack((side*ox,np.full_like(x,oy),np.full_like(x,oz)))
    delta+=d*(q**3)[:,None]
    grad=(-6*q*q)[:,None]*np.column_stack((u/rx,v/ry,w/rz))
    jac+=d[:,:,None]*grad[:,None,:]
p+=delta
normal_transform=np.linalg.inv(jac).transpose(0,2,1)
n=np.einsum('nij,nj->ni',normal_transform[loop_vertices],n)
n/=np.maximum(1e-12,np.linalg.norm(n,axis=1))[:,None]
mesh.vertices.foreach_set('co',(p[:,[0,2,1]]*[1,-1,1]).astype(np.float32).ravel())
mesh.update()
mesh.normals_split_custom_set((n[:,[0,2,1]]*[1,-1,1]).tolist())
low.name='BODYFORGE bake target - unchanged game topology'

# The authored field has only mesoscopic folds. Existing measured pore bump
# remains a separate runtime layer and is not baked a second time.
def smooth(a,b,t):
    u=np.clip((t-a)/(b-a),0,1)
    return u*u*(3-2*u)

def face_mask(points):
    x,y,z=points.T
    return ((1-smooth(.059,.076,np.abs(x)))*smooth(1.568,1.584,y)*
            (1-smooth(1.738,1.751,y))*smooth(.092,.118,z))

def relief(points):
    x,y,z=points.T;a=np.abs(x)
    h=np.zeros_like(x)
    # Broad-to-fine nasolabial groove with a restrained adjacent raised fold.
    centre=.018+.68*(1.633-y)
    envelope=smooth(1.595,1.603,y)*(1-smooth(1.627,1.635,y))
    h+=envelope*(-.00023*np.exp(-((a-centre)/.00165)**2)+
                 .00010*np.exp(-((a-centre-.0025)/.0030)**2))
    # Short alar crease, lower lip transition, and subtle orbital secondary fold.
    h-=.00013*np.exp(-((a-.0175)/.0015)**2-((y-1.632)/.0042)**2)
    h-=.00014*np.exp(-((y-(1.583-.10*a))/.0013)**2-(a/.026)**4)
    lid_line=1.657+.002*np.cos((a-.030)/.018*math.pi)
    h-=.000075*np.exp(-((y-lid_line)/.00085)**2-((a-.032)/.018)**4)
    # Three shallow nonuniform forehead creases, not deep age wrinkles.
    for height,depth,width in [(1.713,.000070,.00075),(1.725,.000055,.00085),(1.737,.000040,.00085)]:
        line=height-.9*x*x+.0003*np.sin(x*115+height*91)
        h-=depth*np.exp(-((y-line)/width)**2-(a/.046)**4)
    return h*face_mask(points)

high=low.copy();high.data=mesh.copy();bpy.context.collection.objects.link(high)
high.name='BODYFORGE authored facial relief - offline high surface'
bpy.context.view_layer.objects.active=high
sub=high.modifiers.new('Surface sampling without silhouette smoothing','SUBSURF')
sub.subdivision_type='SIMPLE';sub.levels=1;sub.render_levels=1
bpy.ops.object.modifier_apply(modifier=sub.name)
# Recompute high-resolution geometry normals after the displacement.
hm=high.data
hm.normals_split_custom_set([(0.,0.,0.)]*len(hm.loops))
hm.update()
hp=np.array([[v.co.x,v.co.z,-v.co.y] for v in hm.vertices])
hn=np.array([[v.normal.x,v.normal.z,-v.normal.y] for v in hm.vertices])
height=relief(hp)
assert np.isfinite(height).all() and np.max(np.abs(height))<.0004
assert np.count_nonzero(np.abs(height)>.000025)>100
hp+=hn*height[:,None]
hm.vertices.foreach_set('co',(hp[:,[0,2,1]]*[1,-1,1]).astype(np.float32).ravel())
hm.update()
hm.normals_split_custom_set([(0.,0.,0.)]*len(hm.loops))
hm.calc_loop_triangles()
print('HIGH_RELIEF',json.dumps(dict(vertices=len(hm.vertices),triangles=len(hm.loop_triangles),
    affected=int(np.count_nonzero(np.abs(height)>.000025)),maxOffsetMm=float(np.max(np.abs(height))*1000))),flush=True)

# Clean materials: bake geometric normals, not the donor's earlier pore shader.
mat=bpy.data.materials.new('Neutral high surface');mat.use_nodes=True
high.data.materials.clear();high.data.materials.append(mat)
low_mat=mat.copy();low_mat.name='Normal bake receiver';low.data.materials.clear();low.data.materials.append(low_mat)
size=2048
image=bpy.data.images.new('Facial relief tangent normals - linear',size,size,alpha=True,float_buffer=True)
image.colorspace_settings.name='Non-Color'
node=low_mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;low_mat.node_tree.nodes.active=node
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=1
scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.bake.use_selected_to_active=True;scene.render.bake.cage_extrusion=.0015
scene.render.bake.max_ray_distance=.004;scene.render.bake.margin=8
bpy.ops.object.select_all(action='DESELECT');high.select_set(True);low.select_set(True)
bpy.context.view_layer.objects.active=low
bpy.ops.object.bake(type='NORMAL',normal_space='TANGENT',use_selected_to_active=True,use_clear=True,margin=8)
raw=np.empty(size*size*4,dtype=np.float32);image.pixels.foreach_get(raw)
baked=raw.reshape(size,size,4)[:,:,:3]*2-1

# UV raster mask: modify only frontal face pixels, retain the old body atlas.
mesh.calc_loop_triangles();uv=mesh.uv_layers.active.uv
mask=np.zeros((size,size),dtype=np.float32)
for triangle in mesh.loop_triangles:
    xyz=p[list(triangle.vertices)]
    if xyz[:,1].max()<1.568 or xyz[:,1].min()>1.751 or xyz[:,2].max()<.092: continue
    tex=np.array([uv[i].vector[:] for i in triangle.loops])*size-.5
    lo=np.maximum(0,np.ceil(tex.min(axis=0)).astype(int));hi=np.minimum(size-1,np.floor(tex.max(axis=0)).astype(int))
    if (hi<lo).any(): continue
    basis=(tex[1:]-tex[0]).T
    if abs(np.linalg.det(basis))<1e-8: continue
    xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1),np.arange(lo[1],hi[1]+1))
    u,v=np.linalg.inv(basis)@(np.stack((xx.ravel(),yy.ravel()))-tex[0,:,None])
    keep=(u>=-1e-6)&(v>=-1e-6)&(u+v<=1.000001)
    xi,yi=xx.ravel()[keep],yy.ravel()[keep]
    xyz=xyz[0]+u[keep,None]*(xyz[1]-xyz[0])+v[keep,None]*(xyz[2]-xyz[0])
    mask[yi,xi]=np.maximum(mask[yi,xi],face_mask(xyz))
# Four-texel feather into UV padding, with no wrapping to another image edge.
for _ in range(4):
    pad=np.pad(mask,1);next_mask=mask.copy()
    for dy,dx in [(-1,0),(1,0),(0,-1),(0,1)]:
        next_mask=np.maximum(next_mask,pad[1+dy:1+dy+size,1+dx:1+dx+size]*.75)
    mask=next_mask
valid=np.isfinite(baked).all(axis=2)&(baked[:,:,2]>.3)&(np.linalg.norm(baked,axis=2)>.8)
failed=np.count_nonzero((mask>.1)&~valid)
assert failed<max(20,.002*np.count_nonzero(mask>.1)),('bake misses',failed)
mask*=valid
base_image=bpy.data.images.load(str(normal_path));base_image.colorspace_settings.name='Non-Color'
assert tuple(base_image.size)==(1024,1024)
a=np.empty(1024*1024*4,dtype=np.float32);base_image.pixels.foreach_get(a)
base=np.repeat(np.repeat(a.reshape(1024,1024,4)[:,:,:3],2,axis=0),2,axis=1)
bn=base*2-1
# Reoriented normal composition. Neutral bake leaves the original map intact.
t=baked+np.array([0,0,1]);u=bn*np.array([-1,-1,1])
combined=t*np.sum(t*u,axis=2)[:,:,None]/np.maximum(t[:,:,2:3],1e-6)-u
out=bn*(1-mask[:,:,None])+combined*mask[:,:,None]
out/=np.maximum(np.linalg.norm(out,axis=2,keepdims=True),1e-8)
pixels=np.round(np.clip((out+1)*.5,0,1)*255).astype(np.uint8)
original=np.round(base*255).astype(np.uint8)
pixels[mask==0]=original[mask==0]
assert np.isfinite(out).all()
changed=np.any(pixels!=original,axis=2)
assert 1000<np.count_nonzero(changed)<size*size*.25
assert np.all(pixels[mask==0]==original[mask==0])
# Runtime keeps the original 1024px GPU budget. Average normal vectors,
# not display RGB, and retain untouched source texels bit-for-bit.
runtime_size=1024
compact=(pixels.astype(np.float32)/127.5-1).reshape(runtime_size,2,runtime_size,2,3).mean(axis=(1,3))
compact/=np.maximum(np.linalg.norm(compact,axis=2,keepdims=True),1e-8)
compact_pixels=np.round(np.clip((compact+1)*.5,0,1)*255).astype(np.uint8)
changed_blocks=changed.reshape(runtime_size,2,runtime_size,2).any(axis=(1,3))
compact_original=original[::2,::2]
compact_pixels[~changed_blocks]=compact_original[~changed_blocks]
compact_changed=np.any(compact_pixels!=compact_original,axis=2)
assert 1000<compact_changed.sum()<runtime_size*runtime_size*.06
# No color-management conversion: PNG channels are literal normal numbers.
def chunk(kind,data):
    return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
with output.open('xb') as f:
    f.write(b'\x89PNG\r\n\x1a\n');f.write(chunk(b'IHDR',struct.pack('>IIBBBBB',runtime_size,runtime_size,8,2,0,0,0)))
    f.write(chunk(b'IDAT',zlib.compress(b''.join(b'\0'+row.tobytes() for row in compact_pixels[::-1]),9)));f.write(chunk(b'IEND',b''))
assert output.stat().st_size<700000
report=dict(source=source.name,profile=profile['id'],sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
    profileSha256=hashlib.sha256(profile_path.read_bytes()).hexdigest(),bakeSize=size,width=runtime_size,height=runtime_size,
    highVertices=len(hm.vertices),highTriangles=len(hm.loop_triangles),maxOffsetMm=float(np.max(np.abs(height))*1000),
    affectedHighVertices=int(np.count_nonzero(np.abs(height)>.000025)),changedTexels=int(compact_changed.sum()),
    untouchedTexels=int(np.count_nonzero(~changed_blocks)),failedBakeTexels=int(failed),
    bytes=output.stat().st_size,sha256=hashlib.sha256(output.read_bytes()).hexdigest())
output.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
# Pack the final runtime map, connect it and hide the overlapping high copy.
final_image=bpy.data.images.load(str(output));final_image.colorspace_settings.name='Non-Color';final_image.pack()
node.image=final_image
normal_node=low_mat.node_tree.nodes.new('ShaderNodeNormalMap');normal_node.inputs['Strength'].default_value=.65
low_mat.node_tree.links.new(node.outputs['Color'],normal_node.inputs['Color'])
low_mat.node_tree.links.new(normal_node.outputs['Normal'],low_mat.node_tree.nodes.get('Principled BSDF').inputs['Normal'])
high.hide_render=True;high.hide_set(True);high.select_set(False);low.select_set(True)
bpy.context.view_layer.objects.active=low
scene['BODYFORGE_BAKE_NOTES']='Bounded authored relief, no scan claim. Production UV/skin weights unchanged. Runtime atlas 1024px.'
bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
print('FACE_BAKE_PASS',json.dumps(report),flush=True)
print('BLEND_RECEIPT',blend.stat().st_size,hashlib.sha256(blend.read_bytes()).hexdigest(),flush=True)
