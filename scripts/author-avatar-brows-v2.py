"""Author tapered eyebrow strands on the evaluated BODYFORGE Face V2.
Run Blender -b --factory-startup --disable-autoexec --python-exit-code 1
 --python scripts/author-avatar-brows-v2.py -- BODY_GLB PROFILE_JSON OUTPUT_GLB
The existing head bone remains the runtime owner; no external donor/texture.
"""
import bpy
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import random
import sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree

source, profile_path, output = map(Path, sys.argv[sys.argv.index('--')+1:])
profile=json.loads(profile_path.read_text(encoding='utf8'))
assert profile['id']=='bodyforge-facial-planes-v2'
assert hashlib.sha256(source.read_bytes()).hexdigest()==profile['sourceSha256']
if output.exists(): raise FileExistsError(output)
spec=importlib.util.spec_from_file_location('bf_face',Path(__file__).with_name('author-avatar-face.py'))
face=importlib.util.module_from_spec(spec)
spec.loader.exec_module(face)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
body=bpy.data.objects['BODYFORGE_Body']
points, _=face.deform(face.positions(body.data),profile['zones'])
surface=face.bvh(points,body.data)
rng=random.Random(20261124)
vertices,polygons,colors=[],[],[]
max_lift=0
for side in (-1,1):
    for segment in range(28):
        for strand in range(15):
            t=(segment+rng.uniform(.03,.97))/28
            x=side*(.015+.040*t)
            arch=1.690+.0042*math.sin(math.pi*t)
            spread=.0021*(1-.55*t)
            root_y=arch+rng.uniform(-spread,spread)
            dx=side*rng.uniform(.0010,.0031)*(0.8+.3*t)
            dy=rng.uniform(.0013,.0034)*(1-.52*t)
            width=rng.uniform(.00020,.00035)*(1-.55*t)
            lift=rng.uniform(.00048,.00068)
            tone=rng.uniform(.58,1.0)
            start=len(vertices)
            for progress,across in [(0,-1),(0,1),(.62,-1),(.62,1),(1,0)]:
                ray=Vector((x+dx*progress+across*width*(1-progress),-.4,root_y+dy*progress))
                point,normal,idx,_=surface.ray_cast(ray,Vector((0,1,0)),.5)
                assert point is not None and idx is not None and normal.y<-.05
                p=point+normal*lift
                max_lift=max(max_lift,(p-point).length)
                vertices.append(p)
                colors.append((tone,tone,tone,1))
            polygons.extend([(start,start+1,start+3),(start,start+3,start+2),(start+2,start+3,start+4)])
mesh=bpy.data.meshes.new('BODYFORGE_FittedBrowStrands')
mesh.from_pydata(vertices,[],polygons)
mesh.update()
color=mesh.color_attributes.new(name='COLOR_0',type='FLOAT_COLOR',domain='POINT')
for i,rgba in enumerate(colors): color.data[i].color=rgba
mat=bpy.data.materials.new('BODYFORGE matte eyebrow fibres')
mat.use_nodes=True
bsdf=mat.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Base Color'].default_value=(.08,.08,.08,1)
bsdf.inputs['Roughness'].default_value=.94
bsdf.inputs['Metallic'].default_value=0
mat.use_backface_culling=False
mesh.materials.append(mat)
obj=bpy.data.objects.new('BODYFORGE_BrowsV2',mesh)
bpy.context.collection.objects.link(obj)
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active=obj
assert len(vertices)==4200 and len(polygons)==2520
bpy.ops.export_scene.gltf(filepath=str(output.resolve()),export_format='GLB',use_selection=True,export_texcoords=False,export_normals=True,export_vertex_color='ACTIVE',export_materials='EXPORT',export_animations=False)
assert output.stat().st_size<400000
print('BROWS_V2',json.dumps(dict(strands=840,triangles=len(polygons),vertices=len(vertices),maxLiftMm=max_lift*1000,bytes=output.stat().st_size,sha256=hashlib.sha256(output.read_bytes()).hexdigest())))
