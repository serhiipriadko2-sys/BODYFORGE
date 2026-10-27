"""CC0 hair-card adaptation, packed Blender source and bounded glTF export.

Run with Blender --background --factory-startup --python-exit-code 1 --python.
The source scene, face, UVs, clothing and original bind rig remain unchanged.
"""
from pathlib import Path
import hashlib
import json
import math

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public/assets'
PRIVATE = ROOT / '.iskra/reports/athlete-source'
SOURCE = ROOT / 'art/bodyforge-athlete-realistic.blend'
EXPECTED = '5fda92f77defe426475e5518078803f2398b04457758bca280939d6497324dde'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED
PINNED = {
    'short02.obj': '48f979114adfa712165a69cc55c45a70831af1fb3cba8e2a89120f0c87407b64',
    'short04.obj': '676964a133ee35ffcea1195382bf75542da7a298931e4001bc7b0d7b707225de',
    'short02_diffuse.png': '47fe33831a3929567c733356dd66243116e05df2ace1f884ddca0080b728229f',
    'short04_diffuse.png': '0bef7fc0e403db5a40fabb2111ebfa6f7e8158e204c6e56b8da98e9ef527846e',
    'short02_normal.png': '2cfac7619f8eec77dd90df979d912415058f4f0fc16940cba40a8eb1ae6d74b5',
}
for file, sha in PINNED.items():
    assert hashlib.sha256((PRIVATE / file).read_bytes()).hexdigest() == sha, file
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
bpy.context.preferences.filepaths.save_version = 0
bpy.context.scene.render.image_settings.file_format = 'PNG'
bpy.context.scene.render.image_settings.color_mode = 'RGBA'
body = bpy.data.objects['BODYFORGE_Body']
rig = next(obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE')
for bone in rig.pose.bones:
    bone.matrix_basis = Matrix.Identity(4)
for obj in [body, bpy.data.objects['BODYFORGE_SkinNipples']]:
    for modifier in list(obj.modifiers):
        if modifier.type == 'MASK':
            obj.modifiers.remove(modifier)
for obj in list(bpy.data.objects):
    if obj.name.startswith('BODYFORGE_Hair_'):
        bpy.data.objects.remove(obj, do_unlink=True)
body['BODYFORGE_groom'] = 'v2'
surface = BVHTree.FromPolygons([v.co for v in body.data.vertices],
    [list(p.vertices) for p in body.data.polygons], all_triangles=True)
CENTRE = Vector((0, -.045, 1.690))


HEIGHTS = {}


def atlas(normal=False):
    data = np.ones((512, 1024, 4), dtype=np.float32)
    if normal:
        data[:, :, :3] = (.5, .5, 1)
    for slot, name in enumerate(['short04', 'short02']):
        if normal and slot == 0:
            gy, gx = np.gradient(HEIGHTS[name])
            vector = np.stack((-gx * 7, -gy * 7, np.ones_like(gx)), axis=-1)
            vector /= np.linalg.norm(vector, axis=-1, keepdims=True)
            data[:, :512, :3] = vector * .5 + .5
            continue
        image = bpy.data.images.load(str(PRIVATE / (name + ('_normal.png' if normal else '_diffuse.png'))), check_existing=False)
        if normal:
            image.colorspace_settings.name = 'Non-Color'
        image.scale(512, 512)
        pixels = np.array(image.pixels[:], dtype=np.float32).reshape(512, 512, 4)
        if not normal:
            # Neutral luminance preserves authored fibre shading and alpha,
            # while making all in-game hair dyes meaningful, including silver.
            luminance = pixels[:, :, 0] * .2126 + pixels[:, :, 1] * .7152 + pixels[:, :, 2] * .0722
            reference = float(np.percentile(luminance[pixels[:, :, 3] > .38], 97))
            value = .035 + .85 * np.clip(luminance / max(reference, 1e-6), 0, 1) ** .85
            HEIGHTS[name] = value
            pixels[:, :, :3] = value[:, :, None]
        else:
            gy, gx = np.gradient(HEIGHTS[name])
            vector = pixels[:, :, :3] * 2 - 1
            vector[:, :, :2] *= .35
            vector[:, :, 0] -= gx * 7
            vector[:, :, 1] -= gy * 7
            vector /= np.maximum(np.linalg.norm(vector, axis=-1, keepdims=True), 1e-6)
            pixels[:, :, :3] = vector * .5 + .5
        data[:, slot * 512:(slot + 1) * 512] = pixels
        bpy.data.images.remove(image)
    image = bpy.data.images.new('Athlete groom ' + ('normal' if normal else 'albedo alpha'), 1024, 512, alpha=True)
    if normal:
        image.colorspace_settings.name = 'Non-Color'
    image.pixels.foreach_set(data.ravel())
    if normal:
        image.scale(512, 256)
        packed = np.array(image.pixels[:], dtype=np.float32).reshape(256, 512, 4)
        vector = packed[:, :, :3] * 2 - 1
        vector /= np.maximum(np.linalg.norm(vector, axis=-1, keepdims=True), 1e-6)
        packed[:, :, :3] = vector * .5 + .5
        image.pixels.foreach_set(packed.ravel())
    image.filepath_raw = str(ASSETS / ('athlete-hair-normal.png' if normal else 'athlete-hair.png'))
    image.file_format = 'PNG'
    image.save()
    return image


hair_image, normal_image = atlas(), atlas(True)
material = bpy.data.materials.new('BODYFORGE_CC0HairCards')
material.use_nodes = True
nodes, links = material.node_tree.nodes, material.node_tree.links
shader = nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value = .78
shader.inputs['Specular IOR Level'].default_value = .14
tex = nodes.new('ShaderNodeTexImage')
tex.image = hair_image
mix = nodes.new('ShaderNodeMixRGB')
mix.blend_type = 'MULTIPLY'
mix.inputs[0].default_value = 1
mix.inputs[1].default_value = (.012, .015, .022, 1)
links.new(tex.outputs['Color'], mix.inputs[2])
links.new(mix.outputs['Color'], shader.inputs['Base Color'])
clip = nodes.new('ShaderNodeMath')
clip.operation = 'GREATER_THAN'
clip.inputs[1].default_value = .38
links.new(tex.outputs['Alpha'], clip.inputs[0])
links.new(clip.outputs[0], shader.inputs['Alpha'])
norm_tex = nodes.new('ShaderNodeTexImage')
norm_tex.image = normal_image
normal = nodes.new('ShaderNodeNormalMap')
normal.inputs['Strength'].default_value = .45
links.new(norm_tex.outputs['Color'], normal.inputs['Color'])
links.new(normal.outputs[0], shader.inputs['Normal'])


def bind(name, vertices, faces, uvs, assigned_material):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name='UVMap')
    for polygon in mesh.polygons:
        polygon.use_smooth = True
        for loop in polygon.loop_indices:
            uv.data[loop].uv = uvs[loop]
    mesh.materials.append(assigned_material)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.vertex_groups.new(name='head').add(list(range(len(vertices))), 1, 'REPLACE')
    obj.modifiers.new('Original head rig', 'ARMATURE').object = rig
    obj.parent = rig
    obj['BODYFORGE_hairStyle'] = name.rsplit('_', 1)[-1]
    return obj


def authored(style, source, slot):
    vertices, source_uv, faces, corners = [], [], [], []
    for line in (PRIVATE / (source + '.obj')).read_text(encoding='utf8').splitlines():
        parts = line.split()
        if not parts:
            continue
        if parts[0] == 'v':
            vertices.append(tuple(map(float, parts[1:4])))
        elif parts[0] == 'vt':
            source_uv.append(tuple(map(float, parts[1:3])))
        elif parts[0] == 'f':
            values = [v.split('/') for v in parts[1:]]
            faces.append(tuple(int(v[0]) - 1 for v in values))
            corners.extend((int(v[1]) - 1) for v in values)
    max_height = max(v[1] for v in vertices)
    mid_x = (min(v[0] for v in vertices) + max(v[0] for v in vertices)) / 2
    points = []
    for x, height, front in vertices:
        point = Vector(((x - mid_x) * .100, -front * .10 + .005, (height - max_height) * .080 + 1.805))
        direction = (point - CENTRE).normalized()
        hit, n, _, _ = surface.ray_cast(CENTRE + direction * .30, -direction, .35)
        if hit is not None:
            # Keep the authored card layers, only bring embedded roots outside
            # the actual skull. The card UVs and strand silhouette are retained.
            radius = max((point - CENTRE).length, (hit - CENTRE).length + .0012)
            point = CENTRE + direction * radius
        points.append(point)
    uvs = [((source_uv[i][0] + slot) / 2, source_uv[i][1]) for i in corners]
    obj = bind('BODYFORGE_Hair_' + style, points, faces, uvs, material)
    obj['BODYFORGE_sourceHair'] = source
    return obj


def buzz():
    vertices, faces, uvs = [], [], []
    columns, rows = 56, 16
    for row in range(rows + 1):
        for col in range(columns + 1):
            phi = col / columns * math.tau
            front, back = max(0, math.sin(phi)), max(0, -math.sin(phi))
            theta = max(.002, row / rows * (1.62 - .50 * front ** .55 + .47 * back))
            direction = Vector((math.sin(theta) * math.cos(phi), -math.sin(theta) * math.sin(phi), math.cos(theta)))
            hit, n, _, _ = surface.ray_cast(CENTRE + direction * .30, -direction, .35)
            assert hit is not None
            vertices.append(hit + n * .0015)
            if row < rows and col < columns:
                a = row * (columns + 1) + col
                face = (a, a + 1, a + columns + 2, a + columns + 1)
                faces.append(face)
                uvs.extend([(col / columns, row / rows), ((col + 1) / columns, row / rows),
                            ((col + 1) / columns, (row + 1) / rows), (col / columns, (row + 1) / rows)])
    mat = bpy.data.materials.new('BODYFORGE_BuzzFibres')
    mat.diffuse_color = (.008, .011, .016, 1)
    return bind('BODYFORGE_Hair_buzz', vertices, faces, uvs, mat)


hair = [buzz(), authored('crop', 'short04', 0), authored('swept', 'short02', 1)]
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for obj in [rig] + [o for o in bpy.context.scene.objects if o.type == 'MESH']:
    obj.hide_set(False)
    obj.hide_viewport = False
    obj.select_set(True)
bpy.context.view_layer.objects.active = rig
OUTPUT = ASSETS / 'bodyforge-athlete-detail.glb'
# Export simple, separate placeholders as real glTF materials. Blender's
# PLACEHOLDER mode exports no materials, so GLTFLoader shares one default
# material and independent clothing colors would contaminate one another.
saved_materials = {}
temporary_materials = []
for obj in bpy.context.selected_objects:
    if obj.type != 'MESH':
        continue
    saved_materials[obj] = list(obj.data.materials)
    temp = bpy.data.materials.new('Runtime ' + obj.name)
    temp.use_nodes = True
    old_shader = next((m.node_tree.nodes.get('Principled BSDF') for m in saved_materials[obj] if m.node_tree), None)
    if old_shader:
        temp.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = old_shader.inputs['Roughness'].default_value
    obj.data.materials.clear()
    obj.data.materials.append(temp)
    temporary_materials.append(temp)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format='GLB', use_selection=True,
    export_yup=True, export_animations=False, export_skins=True, export_all_influences=False,
    export_def_bones=False, export_materials='EXPORT', export_texcoords=True,
    export_normals=True, export_extras=True, export_vertex_color='ACTIVE', export_all_vertex_colors=False)
for obj, materials in saved_materials.items():
    obj.data.materials.clear()
    for mat in materials:
        obj.data.materials.append(mat)
for mat in temporary_materials:
    bpy.data.materials.remove(mat)
for obj in [body, bpy.data.objects['BODYFORGE_SkinNipples']]:
    modifier = obj.modifiers.new('Outfit occlusion - non-destructive preview', 'MASK')
    modifier.vertex_group = 'Preview hidden under clothing'
    modifier.invert_vertex_group = True
for bone in rig.pose.bones:
    key = ''.join(c for c in bone.name.lower() if c.isalnum())
    if key in ('upperarm01l', 'upperarm01r'):
        current = bone.matrix.copy()
        desired = (Matrix.Rotation(math.radians(34 if key.endswith('l') else -34), 3, 'Y') @ current.to_3x3()).to_4x4()
        desired.translation = current.translation
        bone.matrix = desired
for obj in hair:
    obj.hide_render = obj.name != 'BODYFORGE_Hair_crop'
    obj.hide_set(obj.hide_render)
for image in bpy.data.images:
    if image.source in {'FILE', 'GENERATED'} and image.users > 0:
        _ = image.pixels[0]
        if image.packed_file is None:
            image.pack()
        assert image.packed_file is not None
BLEND = ROOT / 'art/bodyforge-athlete-detail.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND), compress=True)
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED
report = {'blender': bpy.app.version_string, 'sourceSha256': EXPECTED, 'sourceUnchanged': True,
          'grooms': [{'style': o['BODYFORGE_hairStyle'], 'source': o.get('BODYFORGE_sourceHair', 'scalp-fitted procedural buzz'), 'vertices': len(o.data.vertices)} for o in hair],
          'outputs': [{'path': str(p.relative_to(ROOT)), 'bytes': p.stat().st_size,
                       'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in [OUTPUT, BLEND, ASSETS / 'athlete-hair.png', ASSETS / 'athlete-hair-normal.png']]}
(ROOT / '.iskra/reports/BODYFORGE_DETAIL_20261027.blender.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
print('DETAIL_AUTHOR_PASS ' + json.dumps(report))
