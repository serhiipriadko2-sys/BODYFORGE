"""Editable review scene for the live BODYFORGE muscle envelopes.

Usage:
 node --input-type=module -e "import {MUSCLE_LOBES} from './src/lib/avatarMuscleAnatomy.ts';console.log(JSON.stringify(MUSCLE_LOBES))"
 Save the JSON output as the recipe, then:
 blender -b --factory-startup --disable-autoexec --python-exit-code 1
 --python scripts/author-avatar-anatomy-v2.py -- BODY_GLB RECIPE_JSON OUTPUT_BLEND

This is an offline authoring preview, not the production GLB. The subdivision
modifier is deliberately non-destructive; no new high-poly asset is shipped.
"""
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np

source, recipe_path, output = map(Path, sys.argv[sys.argv.index('--')+1:])
assert hashlib.sha256(source.read_bytes()).hexdigest() == 'df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e'
assert not output.exists()
groups = json.loads(recipe_path.read_text(encoding='utf-8-sig'))
assert list(groups) == ['arms','core','legs','back']
assert [len(v) for v in groups.values()] == [7,8,8,5]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source.resolve()))

def displacement(points, lobes):
    x, y, z = points.T
    side = np.where(x < 0, -1., 1.)
    out = np.zeros_like(points)
    for lobe in lobes:
        cx, cy, cz = lobe['center']
        rx, ry, rz = lobe['radius']
        ox, oy, oz = lobe['offset']
        sx, sz = lobe.get('slope', [0,0])
        dy = y-cy
        u = (side*x-cx-sx*dy)/rx
        v = dy/ry
        w = (z-cz-sz*dy)/rz
        amount = np.maximum(0,1-u*u-v*v-w*w)**3
        out += np.column_stack((side*ox*amount,oy*amount,oz*amount))
    return out

# Blender's Z-up import maps glTF (x,y,z) to Blender (x,-z,y).
def gltf_coordinates(obj):
    points = np.array([v.co[:] for v in obj.data.vertices],dtype=np.float64)
    return points[:,[0,2,1]]*np.array([1,1,-1])

def blender_coordinates(points):
    return (points[:,[0,2,1]]*np.array([1,-1,1])).astype(np.float32)

names = ('BODYFORGE_Body','BODYFORGE_Shirt','BODYFORGE_Shorts',
         'BODYFORGE_SkinNipples','BODYFORGE_ChestMark')
stats = {}
for name in names:
    obj = bpy.data.objects[name]
    points = gltf_coordinates(obj)
    obj.shape_key_add(name='Basis',from_mix=False)
    counts = {}
    combined = np.zeros_like(points)
    for group, lobes in groups.items():
        delta = displacement(points,lobes)
        combined += delta
        key = obj.shape_key_add(name='BF_'+group+'_level5',from_mix=False)
        key.data.foreach_set('co',blender_coordinates(points+delta).ravel())
        key.slider_min=0
        key.slider_max=1
        key.value=1
        counts[group]=int(np.count_nonzero(np.linalg.norm(delta,axis=1)>.0005))
    assert np.linalg.norm(combined,axis=1).max()<.04
    stats[name]={'baseVertices':len(points),'shapeKeys':len(obj.data.shape_keys.key_blocks),
                 'affectedVertices':counts,'maxCombinedMm':float(np.linalg.norm(combined,axis=1).max()*1000)}
    if name in names[:3]:
        # Subdivision remains below the armature in the modifier stack.
        sub=obj.modifiers.new('Review only - high-resolution surface','SUBSURF')
        sub.subdivision_type='CATMULL_CLARK'
        sub.levels=1
        sub.render_levels=1

# One shared set of sliders drives the matching skin and garment shape keys.
controller=bpy.data.objects.new('BODYFORGE Growth Review Controls',None)
bpy.context.collection.objects.link(controller)
for group in groups:
    controller[group]=5.0
    controller.id_properties_ui(group).update(min=0,max=5,soft_min=0,soft_max=5,
        description='Existing game muscle level; geometry preview only')
    for name in names:
        key=bpy.data.objects[name].data.shape_keys.key_blocks['BF_'+group+'_level5']
        driver=key.driver_add('value').driver
        driver.type='SCRIPTED'
        var=driver.variables.new()
        var.name='level'
        var.type='SINGLE_PROP'
        var.targets[0].id=controller
        var.targets[0].data_path='["'+group+'"]'
        driver.expression='level / 5'
controller['note']='Bind-space geometry review. App adds runtime rig growth, pose, cloth corrections and materials.'
bpy.ops.object.select_all(action='DESELECT')
controller.select_set(True)
bpy.context.view_layer.objects.active=controller
bpy.context.view_layer.update()
deps=bpy.context.evaluated_depsgraph_get()
for name in names[:3]:
    obj=bpy.data.objects[name].evaluated_get(deps)
    mesh=obj.to_mesh()
    mesh.calc_loop_triangles()
    stats[name]['previewTriangles']=len(mesh.loop_triangles)
    obj.to_mesh_clear()
bpy.ops.wm.save_as_mainfile(filepath=str(output.resolve()),compress=True)
print('ANATOMY_REVIEW',json.dumps(stats))
print('BLEND_RECEIPT',output.stat().st_size,hashlib.sha256(output.read_bytes()).hexdigest())
