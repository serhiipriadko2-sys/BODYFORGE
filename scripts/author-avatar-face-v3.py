"""Editable topology-preserving face contour review (not production GLB).
Blender -b --factory-startup --disable-autoexec --python-exit-code 1
 --python scripts/author-avatar-face-v3.py -- BODY_GLB V2_JSON V3_JSON OUTPUT_BLEND
"""
import bpy, hashlib, importlib.util, json, sys
import numpy as np
from pathlib import Path

source,prior,contour,target=map(Path,sys.argv[sys.argv.index('--')+1:])
assert not target.exists()
profile=json.loads(prior.read_text(encoding='utf8'))
recipe=json.loads(contour.read_text(encoding='utf8'))
assert recipe['baseProfile']==profile['id']
assert hashlib.sha256(source.read_bytes()).hexdigest()==profile['sourceSha256']
spec=importlib.util.spec_from_file_location('bf_face',Path(__file__).with_name('author-avatar-face.py'))
face=importlib.util.module_from_spec(spec);spec.loader.exec_module(face)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
body=bpy.data.objects['BODYFORGE_Body']
raw=face.positions(body.data)
previous,_=face.deform(raw,profile['zones'])
zones=[{**zone,'pigment':[0,0,0]} for zone in recipe['zones']]
new,delta=face.deform(previous,zones)
p=face.to_gltf(previous)
x,y,z=p.T
length=np.linalg.norm(delta,axis=1)
changed=int(np.count_nonzero(length>.00005))
assert 100<changed<12000 and length.max()<.006
protected=(y>=1.658)|(y<=1.554)|(z<=.080)|((abs(x)<=.031)&(y>=1.586)&(y<=1.616))
assert np.all(length[protected]==0)
# Compare orientation of real triangles in the existing mesh.
body.data.calc_loop_triangles()
indices=np.array([t.vertices[:] for t in body.data.loop_triangles])
def cross(a):
    tri=a[indices]
    return np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0])
before=cross(previous);after=cross(new)
norm=np.linalg.norm(before,axis=1)
valid=(norm>1e-10)&np.any(length[indices]>0,axis=1)
ratios=(before[valid]*after[valid]).sum(axis=1)/norm[valid]**2
assert ratios.min()>.40
# Establish V2 as a distinct relative key. V3 references that key, not raw mesh.
body.shape_key_add(name='Basis',from_mix=False)
v2=body.shape_key_add(name='Face V2',from_mix=False)
v2.data.foreach_set('co',previous.astype(np.float32).ravel());v2.value=1
v3=body.shape_key_add(name='Face V3 - contour correction',from_mix=False)
v3.relative_key=v2
v3.data.foreach_set('co',new.astype(np.float32).ravel());v3.value=1
brows=bpy.data.objects['BODYFORGE_Brows']
brows.shape_key_add(name='Basis',from_mix=False)
key=brows.shape_key_add(name='Face V2',from_mix=False)
brow_positions,_=face.deform(face.positions(brows.data),profile['zones'])
key.data.foreach_set('co',brow_positions.astype(np.float32).ravel());key.value=1
# Viewport preview keeps the source rig, with no geometry export to the game.
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True);bpy.context.view_layer.objects.active=body
body.active_shape_key_index=2
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(target.resolve()),compress=True)
print('FACE_CONTOUR_BLENDER',json.dumps(dict(changed=changed,maxMm=float(length.max()*1000),
 protectedVertices=int(protected.sum()),affectedTriangles=int(valid.sum()),minOrientation=float(ratios.min()),
 bytes=target.stat().st_size,sha256=hashlib.sha256(target.read_bytes()).hexdigest())))
