"""Fit a bounded set of eyelash guides to the actual Face V2 eyelid rims.
Blender --background --factory-startup --disable-autoexec --python-exit-code 1
 --python scripts/author-avatar-lashes.py -- BODY_GLB OCULAR_GLB PROFILE_JSON OUTPUT_JSON
Use --probe instead of OUTPUT_JSON to inspect raycast boundaries.
"""
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import random
import sys

import bpy
from mathutils import Vector
from mathutils.geometry import barycentric_transform

sys.dont_write_bytecode=True
source, ocular, profile_path, target = sys.argv[sys.argv.index('--')+1:]
source, ocular, profile_path = map(Path,(source,ocular,profile_path))
profile=json.loads(profile_path.read_text(encoding='utf8'))
assert profile['id']=='bodyforge-facial-planes-v2'
assert hashlib.sha256(source.read_bytes()).hexdigest()==profile['sourceSha256']
assert hashlib.sha256(ocular.read_bytes()).hexdigest()=='bb558f02e88846add66bf4007b9038844eae9cec7f532aef8005bb453a7bbb39'
spec=importlib.util.spec_from_file_location('face',Path(__file__).with_name('author-avatar-face.py'))
face=importlib.util.module_from_spec(spec)
spec.loader.exec_module(face)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
bpy.ops.import_scene.gltf(filepath=str(ocular.resolve()))
body=bpy.data.objects['BODYFORGE_Body']
eye=bpy.data.objects['BODYFORGE_OcularDetail']
points,_=face.deform(face.positions(body.data),profile['zones'])
skin=face.bvh(points,body.data)
ocular_tree=face.bvh(face.positions(eye.data),eye.data)
direction=Vector((0,1,0))

def trace(x,y):
    ray=Vector((x,-.24,y))
    hit,normal,idx,depth=skin.ray_cast(ray,direction,.22)
    eye_depth=ocular_tree.ray_cast(ray,direction,.2)[3]
    exposed=eye_depth is not None and (depth is None or eye_depth<depth-1e-6)
    return exposed,hit,normal,idx

def rim(x,upper):
    visible=[1.658+i*.00025 for i in range(149) if trace(x,1.658+i*.00025)[0]]
    if not visible:return None
    inside=max(visible) if upper else min(visible)
    outside=inside+(.00025 if upper else -.00025)
    for _ in range(10):
        mid=(inside+outside)/2
        if trace(x,mid)[0]:inside=mid
        else:outside=mid
    # Sample slightly on the skin side of the eye opening.
    y=outside+(.00030 if upper else -.00030)
    exposed,hit,normal,idx=trace(x,y)
    if exposed or hit is None or idx is None:return None
    indices=body.data.polygons[idx].vertices[:]
    assert len(indices)==3
    a,b,c=(Vector(points[i]) for i in indices)
    bc=barycentric_transform(hit,a,b,c,Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
    factors=[max(0,float(v)) for v in bc]
    total=sum(factors)
    weights={}
    for vertex,part in zip(indices,factors):
        for g in body.data.vertices[vertex].groups:
            name=body.vertex_groups[g.group].name
            weights[name]=weights.get(name,0)+g.weight*part/total
    weights=sorted(weights.items(),key=lambda v:-v[1])[:4]
    s=sum(w for _,w in weights)
    weights=[(n,w/s) for n,w in weights if w>1e-6]
    return hit,normal,weights

if target=='--probe':
    for sign in (-1,1):
        for x in [.014,.016,.018,.020,.022,.024,.026,.028,.030,.032,.034,.036,.038,.040,.042,.044,.046]:
            for upper in (True,False):
                hit=rim(sign*x,upper)
                if hit:
                    p,n,w=hit
                    print('RIM',sign,x,'U' if upper else 'L',round(p.z,5),round(-p.y,5),tuple(round(v,3) for v in n),[(name,round(weight,3)) for name,weight in w])
    sys.exit(0)
output=Path(target)
if output.exists():raise FileExistsError(output)
rng=random.Random(20261124)
guides=[]
for side in (-1,1):
    for upper in (True,False):
        count=52 if upper else 26
        for i in range(count):
            t=(i+.5+rng.uniform(-.24,.24))/count
            x=side*(.0222+.0196*t)
            hit=rim(x,upper)
            assert hit is not None, (side,upper,x)
            point,normal,weights=hit
            lid='orbicularis'+('03' if upper else '04')+('.L' if side>0 else '.R')
            assert sum(w for n,w in weights if n==lid)>.25, (x,weights)
            # Same skin weights throughout the curved strand. Root lies
            # on the evaluated rim, with a 0.10 mm forward bias.
            length=(.0037+.0018*math.sin(math.pi*t)) if upper else (.0016+.0010*math.sin(math.pi*t))
            length*=rng.uniform(.85,1.13)
            guide=dict(
                root=[round(point.x,8),round(point.z,8),round(-point.y+.00010,8)],
                upper=upper,
                length=round(length,8),
                spread=round(side*(.10+.32*t)*length,8),
                width=round(rng.uniform(.000065,.000105)*(1 if upper else .8),8),
                weights=[[n.replace('.',''),round(w,8)] for n,w in weights],
                tone=round(rng.uniform(.60,1),5),
            )
            guides.append(guide)
assert len(guides)==156
data=dict(id='bodyforge-lashes-v1',faceProfile=profile['id'],sourceSha256=profile['sourceSha256'],guides=guides)
output.write_text(json.dumps(data,separators=(',',':'))+'\n',encoding='utf8')
print('LASH_GUIDES',json.dumps(dict(count=len(guides),bytes=output.stat().st_size,sha256=hashlib.sha256(output.read_bytes()).hexdigest())))
