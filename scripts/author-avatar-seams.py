"""Derive fitted seam paths and close small accidental shirt holes in Blender.

Pinned CC0 athlete, no replacement body/rig. Export exact glTF vertex anchors
instead of a second clothing rig so seams follow the live garment deformation.
Run Blender -b --factory-startup --disable-autoexec --python-exit-code 1
 --python scripts/author-avatar-seams.py -- SOURCE OUTPUT
"""
import bpy, bmesh, hashlib, json, struct, sys
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree

source,output=(Path(arg).resolve() for arg in sys.argv[sys.argv.index('--')+1:])
data=source.read_bytes()
digest=hashlib.sha256(data).hexdigest()
assert digest=='df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e'
if output.exists(): raise FileExistsError(output)
json_length=struct.unpack_from('<I',data,12)[0]
gltf=json.loads(data[20:20+json_length])
binary=20+json_length+8
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))

def raw_positions(name):
    node=next(n for n in gltf['nodes'] if n.get('name')==name)
    primitive=gltf['meshes'][node['mesh']]['primitives'][0]
    acc=gltf['accessors'][primitive['attributes']['POSITION']]
    view=gltf['bufferViews'][acc['bufferView']]
    assert acc['componentType']==5126 and acc['type']=='VEC3'
    return np.ndarray((acc['count'],3),dtype='<f4',buffer=data,
        offset=binary+view.get('byteOffset',0)+acc.get('byteOffset',0),
        strides=(view.get('byteStride',12),4)).copy()

def boundary_components(bm):
    pending=set(e for e in bm.edges if e.is_boundary)
    groups=[]
    while pending:
        e=pending.pop()
        stack=[e]; group=[e]
        while stack:
            edge=stack.pop()
            for vertex in edge.verts:
                for adjacent in vertex.link_edges:
                    if adjacent in pending:
                        pending.remove(adjacent); stack.append(adjacent); group.append(adjacent)
        groups.append(group)
    return groups

def ordered(group):
    adjacency={}
    for edge in group:
        a,b=edge.verts
        adjacency.setdefault(a,[]).append(b)
        adjacency.setdefault(b,[]).append(a)
    assert all(len(v)==2 for v in adjacency.values()),'Non-circular garment boundary'
    start=min(adjacency,key=lambda v:tuple(v.co))
    path=[start]; prev=None; current=start
    while True:
        nxt=next(v for v in sorted(adjacency[current],key=lambda v:tuple(v.co)) if v!=prev)
        if nxt==start: break
        assert nxt not in path
        path.append(nxt); prev,current=current,nxt
    assert len(path)==len(group)
    return path

out={'version':1,'sourceSha256':digest,'garments':[]}
for name,count in [('BODYFORGE_Shirt',4415),('BODYFORGE_Shorts',1568)]:
    points=raw_positions(name)
    assert len(points)==count
    kd=KDTree(len(points))
    for i,(x,y,z) in enumerate(points): kd.insert(Vector((float(x),float(-z),float(y))),i)
    kd.balance()
    obj=bpy.data.objects[name]
    bm=bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000005)
    bm.normal_update()
    def anchor(v):
        _,index,distance=kd.find(v.co)
        # Blender's import converts the float coordinates through its axis transform.
        assert distance<.00005,(name,index,distance)
        return index
    loops=[]; holes=[]; anchors={}
    def idx(v):
        i=anchor(v)
        anchors[str(i)]=[round(float(n),7) for n in points[i]]
        return i
    for group in boundary_components(bm):
        path=ordered(group)
        center=sum((v.co for v in path),Vector())/len(path)
        x,y,z=center
        if name.endswith('Shirt'):
            if z>1.50: kind='collar'
            elif abs(x)>.26 and z<1.29: kind='sleeve'
            elif z<1.04: kind='hem'
            else: kind='hole'
        else:
            kind='waist' if z>1.00 else 'legHem'
        if kind=='hole':
            assert name.endswith('Shirt') and len(path)<=32
            holes.append(group)
        else:
            loops.append({'kind':kind,'vertices':[idx(v) for v in path]})
    patches=[]
    for group in holes:
        # BMesh fills using adjacent face winding. Existing positions, weights
        # and UVs are unchanged. Caps use original garment material.
        new=bmesh.ops.holes_fill(bm,edges=group,sides=32)['faces']
        assert len(new)==1
        triangles=bmesh.ops.triangulate(bm,faces=new)['faces']
        for face in triangles:
            assert len(face.verts)==3
            patches.extend(idx(v) for v in face.verts)
    loops.sort(key=lambda l:(l['kind'],l['vertices'][0]))
    assert len(loops)==(4 if name.endswith('Shirt') else 3)
    assert len(holes)==(3 if name.endswith('Shirt') else 0)
    out['garments'].append({'name':name,'vertexCount':count,'loops':loops,'patchIndices':patches,'anchors':anchors})
    print(name,'seams',[(l['kind'],len(l['vertices'])) for l in loops],'patch_triangles',len(patches)//3,'anchors',len(anchors))
    bm.free()
output.write_text(json.dumps(out,separators=(',',':'))+'\n',encoding='utf-8')
print('GARMENT_SEAMS',output.stat().st_size,hashlib.sha256(output.read_bytes()).hexdigest())
