"""Directionally groomed, close-fitted brow ribbons on the pinned Face V2.
Blender -b --factory-startup --disable-autoexec --python-exit-code 1
 --python scripts/author-avatar-brows-v3.py -- BODY_GLB PROFILE_JSON OUTPUT_GLB
"""
import bpy, hashlib, importlib.util, json, math, random, sys
from pathlib import Path
from mathutils import Vector

source,profile_path,output=map(Path,sys.argv[sys.argv.index('--')+1:])
profile=json.loads(profile_path.read_text(encoding='utf8'))
assert profile['id']=='bodyforge-facial-planes-v2'
assert hashlib.sha256(source.read_bytes()).hexdigest()==profile['sourceSha256']=='df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e'
if output.exists():raise FileExistsError(output)
spec=importlib.util.spec_from_file_location('bf_face',Path(__file__).with_name('author-avatar-face.py'))
face=importlib.util.module_from_spec(spec);spec.loader.exec_module(face)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
body=bpy.data.objects['BODYFORGE_Body']
points,_=face.deform(face.positions(body.data),profile['zones'])
surface=face.bvh(points,body.data)
rng=random.Random(20261125)
vertices,polygons,colors=[],[],[]
lifts=[]; roots=[]; gaps=[]
def shape(t):
    # Broad inner body, subtly raised peak, thinner falling tail.
    return 1.6904+.0037*math.sin(math.pi*t)-.0014*t**3
def halfwidth(t):
    return .0026*(.55+.45*math.sin(math.pi*min(1,t/.85)))*(1-.64*t*t)

def sample(x,y,lift,tone):
    point,normal,idx,_=surface.ray_cast(Vector((x,-.4,y)),Vector((0,1,0)),.5)
    assert point is not None and idx is not None and normal.y<-.05
    p=point+normal*lift
    nearest=surface.find_nearest(p)
    gap=(p-nearest[0]).dot(nearest[1])
    assert -.000015<=gap<=.00055,(x,y,gap)
    lifts.append(lift);gaps.append(gap)
    vertices.append(p);colors.append((tone,tone,tone,1))

for side in (-1,1):
    # Stratified roots avoid clumps/gaps from unbounded random scatter.
    # 35 by 16 samples per eyebrow; density and width fall towards the tail.
    for segment in range(35):
        for row in range(16):
            t=(segment+rng.uniform(.12,.88))/35
            lateral=(row+rng.uniform(.12,.88))/16*2-1
            x=.0152+.0390*t
            y=shape(t)+lateral*halfwidth(t)
            # Medial hairs are upright; the upper row curves down and the
            # lower row sweeps up. Both converge towards the lateral tail.
            dx=rng.uniform(.0031,.0049)*(.30+.70*t**.48)
            dy=rng.uniform(.0023,.0035)*(1-t)**1.35
            dy*= .66-.72*lateral
            dy-=.00105*t*t
            w=rng.uniform(.000085,.000145)*(1-.36*t)
            lift=rng.uniform(.00006,.00013)
            tone=rng.uniform(.70,1.0)
            roots.append((t,dx,dy))
            start=len(vertices)
            for s in (0,.37,.75,1):
                # Two endpoints except at the tapered tip.
                cx=x+dx*s
                cy=y+dy*s+.00036*math.sin(math.pi*s)*(1-t)
                tx=dx;ty=dy+.00036*math.pi*math.cos(math.pi*s)*(1-t)
                length=math.hypot(tx,ty)
                width=w*(1-.81*s)**.75
                for a in ((-1,1) if s<1 else (0,)):
                    sx=side*(cx-a*ty/length*width)
                    sy=cy+a*tx/length*width
                    elevation=lift+.00020*math.sin(math.pi*s)**1.25
                    sample(sx,sy,elevation,tone*(.96+.04*math.sin(math.pi*s)))
            # Keep winding consistent on both sides of the face.
            for tri in ((0,1,3),(0,3,2),(2,3,5),(2,5,4),(4,5,6)):
                f=tuple(start+i for i in tri)
                polygons.append(f if side>0 else tuple(reversed(f)))

mesh=bpy.data.meshes.new('BODYFORGE_DirectionalBrowStrands')
mesh.from_pydata(vertices,[],polygons);mesh.update()
for polygon in mesh.polygons:polygon.use_smooth=True
color=mesh.color_attributes.new(name='COLOR_0',type='FLOAT_COLOR',domain='POINT')
for i,rgba in enumerate(colors):color.data[i].color=rgba
mat=bpy.data.materials.new('BODYFORGE natural brow fibres')
mat.use_nodes=True
bsdf=mat.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Base Color'].default_value=(.08,.08,.08,1)
bsdf.inputs['Roughness'].default_value=.87
bsdf.inputs['Metallic'].default_value=0
mat.use_backface_culling=False
mesh.materials.append(mat)
obj=bpy.data.objects.new('BODYFORGE_BrowsV3',mesh)
obj['BODYFORGE_brow_revision']='directional-v3'
bpy.context.collection.objects.link(obj)
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True);bpy.context.view_layer.objects.active=obj
assert len(vertices)==7840 and len(polygons)==5600
bpy.ops.export_scene.gltf(filepath=str(output.resolve()),export_format='GLB',use_selection=True,
 export_texcoords=False,export_normals=True,export_vertex_color='ACTIVE',export_materials='EXPORT',
 export_animations=False,export_extras=True)
assert output.stat().st_size<500000
print('BROWS_V3',json.dumps(dict(strands=1120,triangles=len(polygons),vertices=len(vertices),
 minGapMm=min(gaps)*1000,maxGapMm=max(gaps)*1000,maxLiftMm=max(lifts)*1000,
 medialMeanSlope=sum(dy/dx for t,dx,dy in roots if t<.2)/sum(t<.2 for t,_,_ in roots),
 lateralMeanSlope=sum(dy/dx for t,dx,dy in roots if t>.8)/sum(t>.8 for t,_,_ in roots),
 bytes=output.stat().st_size,sha256=hashlib.sha256(output.read_bytes()).hexdigest())))
