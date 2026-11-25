"""Independent Blender BMesh check of the exact packed/capped shirt.
Run after scripts/export-avatar-garment-fit.mjs.
Arguments: pinned BODY_GLB, runtime JSON (no writes).
"""
import bpy, bmesh, hashlib, json, sys
from pathlib import Path
source, input_path=map(Path,sys.argv[sys.argv.index('--')+1:])
data=json.loads(input_path.read_text(encoding='utf8'))
assert hashlib.sha256(source.read_bytes()).hexdigest()==data['sourceSha256']=='df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e'
g=data['garments'][0]
assert g['name']=='BODYFORGE_Shirt' and len(g['positions'])==4415
triangles=[g['indices'][i:i+3] for i in range(0,len(g['indices']),3)]
cluster={1252,1253,2122,2370,4381,4382,4383,4410}
collapsed=lambda t:[1252 if i in cluster else i for i in t]
removed=[i for i,t in enumerate(triangles) if len(set(collapsed(t)))<3]
assert removed==[5270,5757,5758,5845,8100,8101,8102,8103,8236,8237,8242,8243,8334,8335]
def audit(label,faces):
    mesh=bpy.data.meshes.new(label)
    mesh.from_pydata(g['positions'],[],faces)
    mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0000005)
    # BMesh removes collapsed degenerate faces during welding.
    boundary=sum(e.is_boundary for e in bm.edges)
    nonmanifold=sum(not e.is_manifold and not e.is_boundary and not e.is_wire for e in bm.edges)
    print(label,json.dumps(dict(inputTriangles=len(faces),weldedFaces=len(bm.faces),boundaryEdges=boundary,nonManifoldInterior=nonmanifold)))
    bm.free();bpy.data.meshes.remove(mesh)
    return boundary,nonmanifold
audit('BEFORE',triangles)
assert audit('AFTER',[t for i,t in enumerate(triangles) if i not in removed])==(328,0)
print('SLEEVE_BLENDER_PASS',removed)
