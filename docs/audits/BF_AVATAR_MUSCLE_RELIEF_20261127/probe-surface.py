"""Read the pinned athlete and measure the actual front/back surface at anatomical control locations."""
import bpy,hashlib,json
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from pathlib import Path
src=Path('public/assets/bodyforge-athlete-efficient.glb')
assert hashlib.sha256(src.read_bytes()).hexdigest()=='df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(src.resolve()))
body=bpy.data.objects['BODYFORGE_Body']
bvh=BVHTree.FromPolygons([v.co.copy() for v in body.data.vertices],[p.vertices[:] for p in body.data.polygons],all_triangles=True)
def probe(x,y,front):
    # glTF coordinates (+z anterior); Blender imported coordinates (x,-z,y).
    sign=1 if front else -1
    hit,n,_,dist=bvh.ray_cast(Vector((x,-sign*.8,y)),Vector((0,sign,0)),1.6)
    return None if hit is None else {'z':round(-hit.y,5),'normal':[round(n.x,3),round(n.z,3),round(-n.y,3)]}
targets=[
 ('core','pec belly',.102,1.35,1),('core','pec lower edge',.115,1.279,1),
 ('core','pec upper edge',.135,1.394,1),('core','sternum',0,1.32,1),
 ('core','rectus upper',.047,1.237,1),('core','rectus mid',.047,1.183,1),('core','rectus lower',.044,1.131,1),
 ('core','intersection upper',.046,1.209,1),('core','intersection lower',.044,1.157,1),
 ('core','linea alba',0,1.178,1),('core','oblique',.121,1.175,1),
 ('arms','deltoid front',.253,1.399,1),('arms','deltoid insertion',.294,1.345,1),
 ('arms','biceps crest',.316,1.313,1),('arms','biceps inner transition',.279,1.302,1),
 ('arms','triceps lateral crest',.325,1.314,0),('arms','triceps inner transition',.287,1.309,0),
 ('arms','forearm proximal crest',.407,1.194,1),('arms','forearm distal transition',.462,1.144,1),
 ('back','trapezius crest',.074,1.435,0),('back','scapular medial',.064,1.372,0),('back','scapular lateral',.153,1.380,0),
 ('back','lat crest',.145,1.285,0),('back','lat inner transition',.102,1.272,0),
 ('back','erector crest',.040,1.170,0),('back','midline',0,1.310,0),
 ('legs','vastus medialis',.102,.644,1),('legs','rectus femoris',.130,.755,1),
 ('legs','vastus lateralis',.181,.751,1),('legs','quad separation',.155,.688,1),
 ('legs','calf medial',.146,.400,0),('legs','calf lateral',.206,.404,0),
 ('legs','calf center transition',.178,.385,0),('legs','tibialis',.187,.350,1),
]
r=[]
for g,name,x,y,f in targets:
    value=probe(x,y,bool(f))
    r.append(dict(group=g,name=name,x=x,y=y,front=bool(f),surface=value))
    print(name,x,y,value)
out=Path('docs/audits/BF_AVATAR_MUSCLE_RELIEF_20261127/surface-probes.json')
with out.open('x',encoding='utf-8') as fp:json.dump({'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'scope':'Raw bind-pose ray intersections; artistic candidate landmarks, not measured biological anatomy.','probes':r},fp,indent=2)
