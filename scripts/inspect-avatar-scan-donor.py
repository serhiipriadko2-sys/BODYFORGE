"""Read-only scan/rig orthographic landmark inspection. Blender 5.2."""
import bpy, hashlib, importlib.util, json, sys
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
folder=root/'.bodyforge-qa/scan-donor-20261125'
source=root/'public/assets/bodyforge-athlete-efficient.glb'
donor=folder/'LeePerrySmith.glb'
assert hashlib.sha256(source.read_bytes()).hexdigest()=='df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e'
assert hashlib.sha256(donor.read_bytes()).hexdigest()=='402b8a8ac9f03232e6d64b5962929703a069daf99d3c49ac8eb0e48bedc9c576'
spec=importlib.util.spec_from_file_location('bf_face',Path(__file__).with_name('author-avatar-face.py'))
face=importlib.util.module_from_spec(spec);spec.loader.exec_module(face)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
body=bpy.data.objects['BODYFORGE_Body']
p,_=face.deform(face.positions(body.data),json.loads((root/'src/lib/avatarFaceProfile.json').read_text())['zones'])
p,_=face.deform(p,[{**z,'pigment':[0,0,0]} for z in json.loads((root/'src/lib/avatarFaceContour.json').read_text())['zones']])
bpy.ops.import_scene.gltf(filepath=str(donor))
scan=bpy.data.objects['LeePerrySmith']

def render(mesh,points,box,origin,name):
    mesh.calc_loop_triangles()
    tree=BVHTree.FromPolygons(points.tolist(),[t.vertices[:] for t in mesh.loop_triangles],all_triangles=True)
    w=h=440
    img=np.full((h,w,4),.10,dtype=np.float32);img[:,:,3]=1
    light=Vector((-.35,-1,.65)).normalized()
    for j,y in enumerate(np.linspace(box[2],box[3],h)):
        for i,x in enumerate(np.linspace(box[0],box[1],w)):
            hit,n,idx,dist=tree.ray_cast(Vector((x,origin,y)),Vector((0,1,0)),abs(origin)*2+10)
            if hit is None:continue
            s=.32+.55*max(0,n.dot(light))
            img[j,i,:3]=[s,s,s]
    # Grid provides coordinate correspondence for manual landmarks.
    for k in range(1,10):
        t=round(k*(w-1)/10);img[:,t,:3]*=.78;img[t,:,:3]*=.78
    out=folder/name
    assert not out.exists()
    tex=bpy.data.images.new(name,w,h,alpha=False)
    tex.pixels.foreach_set(img.ravel());tex.filepath_raw=str(out);tex.file_format='PNG';tex.save()
    print('ORTHO',name,box,out.stat().st_size)
render(body.data,p,[-.095,.095,1.545,1.785],-.4,'target-front.png')
render(scan.data,face.positions(scan.data),[-4.5,4.5,-4.3,4.3],-10,'scan-front.png')
