"""Bounded CC0 athlete refinement in an isolated Blender process.

Preserves the original GLB, UVs, rig, bind weights and garment topology. Creates
an independent GLB plus an editable, packed Blender scene. No user images.
Run: blender --background --factory-startup --python scripts/refine-athlete.py
"""
from pathlib import Path
import hashlib
import json
import math
import random

import bpy
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public/assets'
ART = ROOT / 'art'
REPORTS = ROOT / '.iskra/reports'
SOURCE = ASSETS / 'bodyforge-athlete.glb'
EXPECTED = 'e08a53c9833b43b80924d64123681fceeeea5bf3347e4339db07d03e1e722f97'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED
EYE = ROOT / '.iskra/reports/athlete-source/brown_eye.png'
SKIN = ROOT / '.iskra/reports/athlete-source/young_lightskinned_male_diffuse.png'
assert EYE.is_file() and SKIN.is_file()
assert hashlib.sha256(SKIN.read_bytes()).hexdigest() == '862a26e335e958b70534cb5f0d7c47ef30ab148a56c42b3e9da969cf76f12963'
assert hashlib.sha256(EYE.read_bytes()).hexdigest() == '4659691c7295ad6206c78b003e5fd0e5f91dcd53032fa914a229bb48cabe424b'
ART.mkdir(exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0  # This isolated process only.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
body = bpy.data.objects['BODYFORGE_Body']
rig = next(obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE')
body['BODYFORGE_realism'] = 'v1'

# The incoming GLB's eyes use an unrelated packed atlas, including a black
# corner. Project the genuine two-eye texture explicitly; reusing that atlas
# would put black/grey pixels over the whole visible eyeball.
eyes_object = bpy.data.objects['BODYFORGE_Eyes']
eye_uv = eyes_object.data.uv_layers.active
for loop in eyes_object.data.loops:
    point = eyes_object.data.vertices[loop.vertex_index].co
    positive = point.x > 0
    centre_u, centre_v = (.70703125, .703125) if positive else (.294921875, .291015625)
    eye_uv.data[loop.index].uv = (centre_u + (point.x - (.030 if positive else -.030)) * 18.4,
                                centre_v + (point.z - 1.676) * 18.4)


def deform(points):
    """Smooth, symmetric millimetre-scale jaw/chin refinement; eyes untouched."""
    p = np.array(points, dtype=float, copy=True)
    x, front, h = p[:, 0], -p[:, 1], p[:, 2]
    head_mask = np.clip((h - 1.535) / .020, 0, 1)
    head_mask = head_mask * head_mask * (3 - 2 * head_mask)
    front_mask = np.clip((front - .025) / .07, 0, 1) * head_mask
    jaw = np.exp(-((h - 1.562) / .026) ** 2) * front_mask
    p[:, 0] += np.tanh(x / .025) * .0038 * jaw
    p[:, 1] -= .0028 * np.exp(-((h - 1.550) / .018) ** 2) * np.exp(-(x / .055) ** 4) * front_mask
    # Reduce the protruding muzzle slightly without opening the lip seam.
    muzzle = np.exp(-((h - 1.601) / .014) ** 4) * np.exp(-(x / .033) ** 4) * front_mask
    p[:, 1] += .0012 * muzzle
    return p


deformation_stats = {}
for name in ['BODYFORGE_Body', 'BODYFORGE_Lips']:
    obj = bpy.data.objects[name]
    mesh = obj.data
    before = np.array([v.co[:] for v in mesh.vertices])
    after = deform(before)
    # Transform imported split normals by the deformation Jacobian, retaining
    # UV seams and sharp boundaries rather than averaging their corner normals.
    jac = np.empty((len(before), 3, 3))
    for axis in range(3):
        offset = np.zeros_like(before)
        offset[:, axis] = .00001
        jac[:, :, axis] = (deform(before + offset) - deform(before - offset)) / .00002
    normal_matrices = np.transpose(np.linalg.inv(jac), (0, 2, 1))
    normals = []
    for loop, normal in zip(mesh.loops, mesh.corner_normals):
        value = normal_matrices[loop.vertex_index] @ np.array(normal.vector)
        normals.append(value / max(1e-12, np.linalg.norm(value)))
    for vertex, value in zip(mesh.vertices, after):
        vertex.co = value
    mesh.normals_split_custom_set(normals)
    mesh.update()
    delta = np.linalg.norm(after - before, axis=1)
    assert float(delta.max()) < .006
    deformation_stats[name] = {'changedVertices': int(np.count_nonzero(delta > 1e-7)), 'maxDisplacementM': float(delta.max())}


def principled(name, color, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    return mat


hair_material = principled('BODYFORGE_StrandHair', (.009, .012, .017), .68)
hair_shader = hair_material.node_tree.nodes.get('Principled BSDF')
hair_shader.inputs['Specular IOR Level'].default_value = .35
for key in ['Anisotropic IOR Level', 'Anisotropic']:
    if key in hair_shader.inputs:
        hair_shader.inputs[key].default_value = .6
head = rig.matrix_world @ rig.data.bones['head'].head_local

# Replace the former solid eyebrow strips by individually tapered hairs.
surface = BVHTree.FromPolygons([v.co for v in body.data.vertices],
    [list(p.vertices) for p in body.data.polygons], all_triangles=True)
old_brows = bpy.data.objects['BODYFORGE_Brows']
brow_material = old_brows.data.materials[0]
bpy.data.objects.remove(old_brows, do_unlink=True)
points, polygons = [], []
rng = random.Random(20261027)
for sign in (-1, 1):
    for _ in range(220):
        t = rng.random()
        x = sign * (.015 + .040 * t)
        h = 1.690 + .004 * math.sin(math.pi * t) + rng.uniform(-.0013, .0013) * (1 - .6 * t)
        dx, dz = sign * rng.uniform(.0008, .0024), rng.uniform(.0013, .0030) * (1 - .4 * t)
        width = rng.uniform(.00018, .00030) * (1 - .55 * t)
        start = len(points)
        for progress, across in [(0, -1), (0, 1), (.6, -1), (.6, 1), (1, 0)]:
            point, normal, _, _ = surface.ray_cast(Vector((x + dx * progress + across * width * (1 - progress), -.4, h + dz * progress)), Vector((0, 1, 0)), .5)
            assert point is not None
            points.append(point + normal * .00045)
        polygons += [(start, start + 1, start + 3, start + 2), (start + 2, start + 3, start + 4)]
mesh = bpy.data.meshes.new('BODYFORGE_IndividualBrowHairs')
mesh.from_pydata(points, [], polygons)  # X-right/Z-up winding faces Blender -Y.
mesh.materials.append(brow_material)
mesh.update()
brows = bpy.data.objects.new('BODYFORGE_Brows', mesh)
bpy.context.collection.objects.link(brows)
brows.vertex_groups.new(name='head').add(list(range(len(points))), 1, 'REPLACE')
brows.modifiers.new('Original head rig', 'ARMATURE').object = rig
brows.parent = rig


def hairstyle(style):
    """Opaque scalp and fine tapered, curved clumps, one rigged mesh per style."""
    rng = random.Random(20261027 + ['buzz', 'crop', 'swept'].index(style))
    cx, cy, cz = head.x, head.y - .030, head.z + .075
    rx, ry = .086, .088
    rz = .080 if style == 'buzz' else .116 if style == 'swept' else .083
    vertices, faces, uvs = [], [], []
    columns, rows = 64, 16

    def extent(phi):
        front = max(0, math.sin(phi))
        return math.pi * (.625 - .205 * front ** .7 + .005 * math.sin(phi * 11))

    def surface(phi, theta, lift=0):
        return Vector((cx + (rx + lift) * math.sin(theta) * math.cos(phi),
                       cy - (ry + lift) * math.sin(theta) * math.sin(phi),
                       cz + (rz + lift) * math.cos(theta)))

    for row in range(rows + 1):
        for col in range(columns + 1):
            phi = col / columns * math.tau
            theta = row / rows * extent(phi)
            lift = .00025 * math.sin(phi * 35 + theta * 18) * math.sin(theta)
            vertices.append(surface(phi, theta, lift))
            uvs.append((col / columns, 1 - row / rows))
            if row < rows and col < columns:
                a = row * (columns + 1) + col
                faces.append((a, a + columns + 1, a + columns + 2, a + 1))
    count = 0 if style == 'buzz' else 180 if style == 'crop' else 240
    for strand in range(count):
        phi = strand * 2.399963 + rng.uniform(-.12, .12)
        theta = math.acos(1 - rng.uniform(.025, .83))
        theta = min(theta, extent(phi) - .18)
        length = rng.uniform(.20, .48)
        turn = rng.uniform(-.20, .42) * (1.3 if style == 'swept' else .7)
        primary = strand < 36
        width = rng.uniform(.00065, .0014) * (3.3 if primary else 1)
        lift = rng.uniform(.0010, .0034) * (1.7 if primary else 1) * (1.5 if style == 'swept' else 1)
        offset = len(vertices)
        segments, sides = 6, 4

        def point(t):
            az = phi + turn * t + .05 * math.sin(math.pi * t)
            polar = min(extent(az) + .02, theta + length * t)
            return surface(az, polar, lift * math.sin(math.pi * t) - .0006 * (1 - t) ** 2)

        for step in range(segments + 1):
            t = step / segments
            centre = point(t)
            tangent = (point(min(1, t + .001)) - point(max(0, t - .001))).normalized()
            outward = Vector(((centre.x - cx) / rx ** 2, (centre.y - cy) / ry ** 2, (centre.z - cz) / rz ** 2)).normalized()
            across = tangent.cross(outward).normalized()
            normal = across.cross(tangent).normalized()
            taper = .025 + .975 * math.sin(math.pi * (.12 + .88 * t)) ** .65
            for side in range(sides):
                angle = side / sides * math.tau
                vertices.append(centre + across * math.cos(angle) * width * taper + normal * math.sin(angle) * width * .42 * taper)
                uvs.append((side / sides, t))
                if step < segments:
                    a = offset + step * sides + side
                    b = offset + step * sides + (side + 1) % sides
                    faces.append((a, b, b + sides, a + sides))
        faces.append(tuple(offset + side for side in reversed(range(sides))))
        faces.append(tuple(offset + segments * sides + side for side in range(sides)))
    mesh = bpy.data.meshes.new('BODYFORGE_Hair_' + style)
    # The coordinate convention uses Blender -Y as forward; reverse winding so
    # the cap and closed clumps face OUTWARD rather than disappearing in glTF.
    mesh.from_pydata(vertices, [], [tuple(reversed(face)) for face in faces])
    mesh.update()
    layer = mesh.uv_layers.new(name='UVMap')
    for polygon in mesh.polygons:
        polygon.use_smooth = True
        for loop in polygon.loop_indices:
            layer.data[loop].uv = uvs[mesh.loops[loop].vertex_index]
    obj = bpy.data.objects.new('BODYFORGE_Hair_' + style, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(hair_material)
    group = obj.vertex_groups.new(name='head')
    group.add(list(range(len(vertices))), 1, 'REPLACE')
    modifier = obj.modifiers.new('Original head rig', 'ARMATURE')
    modifier.object = rig
    obj.parent = rig
    obj['BODYFORGE_hairStyle'] = style
    return obj


hair = [hairstyle(style) for style in ['buzz', 'crop', 'swept']]
# Export geometry before wiring Blender-only nodes; runtime loads bounded maps
# independently and retains its compatible fallback when an image is missing.
bpy.ops.object.select_all(action='DESELECT')
for obj in [rig] + [o for o in bpy.context.scene.objects if o.type == 'MESH']:
    obj.select_set(True)
bpy.context.view_layer.objects.active = rig
OUTPUT = ASSETS / 'bodyforge-athlete-realistic.glb'
bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format='GLB', use_selection=True,
    export_yup=True, export_animations=False, export_skins=True, export_all_influences=False,
    export_def_bones=False, export_materials='EXPORT', export_texcoords=True, export_normals=True,
    export_extras=True)
for obj in hair:
    obj.hide_render = obj.name != 'BODYFORGE_Hair_swept'

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 16
scene.cycles.use_denoising = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_depth = '8'
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'


def image_file(source, target, size, jpeg=False):
    image = bpy.data.images.load(str(source), check_existing=False)
    image.scale(size, size)
    scene.render.image_settings.file_format = 'JPEG' if jpeg else 'PNG'
    scene.render.image_settings.quality = 94
    image.save_render(str(target), scene=scene)
    bpy.data.images.remove(image)
    return bpy.data.images.load(str(target), check_existing=False)


albedo = image_file(SKIN, ASSETS / 'athlete-skin-detail.jpg', 2048, True)
eye_image = image_file(EYE, ASSETS / 'athlete-eyes.jpg', 512, True)
skin_material = principled('BODYFORGE_StudioSkin', (.6, .4, .3), .54)
body.data.materials.clear()
body.data.materials.append(skin_material)
tree = skin_material.node_tree
nodes, links = tree.nodes, tree.links
shader = nodes.get('Principled BSDF')
output = nodes.get('Material Output')
albedo_node = nodes.new('ShaderNodeTexImage')
albedo_node.image = albedo
links.new(albedo_node.outputs['Color'], shader.inputs['Base Color'])
noise = nodes.new('ShaderNodeTexNoise')
noise.inputs['Scale'].default_value = 820
noise.inputs['Detail'].default_value = 2
bump = nodes.new('ShaderNodeBump')
bump.inputs['Strength'].default_value = .30
bump.inputs['Distance'].default_value = .00010
links.new(noise.outputs['Fac'], bump.inputs['Height'])
links.new(bump.outputs['Normal'], shader.inputs['Normal'])

bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.context.view_layer.objects.active = body
normal_image = bpy.data.images.new('Athlete tangent pore normal', 1024, 1024)
normal_image.colorspace_settings.name = 'Non-Color'
bake = nodes.new('ShaderNodeTexImage')
bake.image = normal_image
nodes.active = bake
bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', margin=8, use_clear=True)
normal_image.filepath_raw = str(ASSETS / 'athlete-normal.png')
normal_image.file_format = 'PNG'
normal_image.save()

ao_image = bpy.data.images.new('Athlete local AO', 512, 512)
ao_image.colorspace_settings.name = 'Non-Color'
bake.image = ao_image
ao = nodes.new('ShaderNodeAmbientOcclusion')
ao.inputs['Distance'].default_value = .018
emission = nodes.new('ShaderNodeEmission')
links.new(ao.outputs['Color'], emission.inputs['Color'])
links.new(emission.outputs[0], output.inputs['Surface'])
nodes.active = bake
bpy.ops.object.bake(type='EMIT', margin=4, use_clear=True)
pixels = np.array(ao_image.pixels[:], dtype=np.float32).reshape(512, 512, 4)
yy, xx = np.mgrid[0:512, 0:512]
pixels[:, :, 0] = np.clip(pixels[:, :, 0], .18, 1)
pixels[:, :, 1] = .54 + .045 * np.sin(xx * 1.7 + yy * .23) * np.sin(yy * 1.3)
pixels[:, :, 2] = 0
pixels[:, :, 3] = 1
ao_image.pixels.foreach_set(pixels.ravel())
ao_image.filepath_raw = str(ASSETS / 'athlete-orm.png')
ao_image.file_format = 'PNG'
ao_image.save()
links.new(shader.outputs[0], output.inputs['Surface'])
normal_node = nodes.new('ShaderNodeTexImage')
normal_node.image = normal_image
normal = nodes.new('ShaderNodeNormalMap')
links.new(normal_node.outputs['Color'], normal.inputs['Color'])
links.new(normal.outputs['Normal'], shader.inputs['Normal'])
shader.inputs['Subsurface Weight'].default_value = 1
shader.inputs['Subsurface Radius'].default_value = (.8, .35, .2)
shader.inputs['Subsurface Scale'].default_value = .0008

lip = bpy.data.objects['BODYFORGE_Lips']
lip_mat = principled('BODYFORGE_TexturedLips', (1, 1, 1), .40)
lip_tex = lip_mat.node_tree.nodes.new('ShaderNodeTexImage')
lip_tex.image = albedo
lip_mat.node_tree.links.new(lip_tex.outputs['Color'], lip_mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
lip.data.materials.clear()
lip.data.materials.append(lip_mat)

# Editable portrait studio; this is not a claim that glTF carries Cycles SSS.
for obj in [body, bpy.data.objects['BODYFORGE_SkinNipples']]:
    covered = []
    for vertex in obj.data.vertices:
        x, h = abs(vertex.co.x), vertex.co.z
        torso = 1.025 < h < 1.510 and x < (.312 if h > 1.34 else .274 if h > 1.15 else .239)
        sleeve = 1.300 < h < 1.440 and x < .395
        shorts = .750 < h < 1.000 and x < .255
        if torso or sleeve or shorts:
            covered.append(vertex.index)
    group = obj.vertex_groups.new(name='Preview hidden under clothing')
    group.add(covered, 1, 'REPLACE')
    modifier = obj.modifiers.new('Outfit occlusion - non-destructive preview', 'MASK')
    modifier.vertex_group = group.name
    modifier.invert_vertex_group = True
for bone in rig.pose.bones:
    key = ''.join(c for c in bone.name.lower() if c.isalnum())
    if key not in ('upperarm01l', 'upperarm01r'):
        continue
    current = bone.matrix.copy()
    delta = Matrix.Rotation(math.radians(34 if key.endswith('l') else -34), 3, 'Y')
    desired = (delta @ current.to_3x3()).to_4x4()
    desired.translation = current.translation
    bone.matrix = desired
eyes = bpy.data.objects['BODYFORGE_Eyes']
eye_mat = principled('BODYFORGE_WetEye', (.8, .8, .8), .16)
eye_shader = eye_mat.node_tree.nodes.get('Principled BSDF')
eye_shader.inputs['Coat Weight'].default_value = .8
eye_shader.inputs['Coat Roughness'].default_value = .08
eye_tex = eye_mat.node_tree.nodes.new('ShaderNodeTexImage')
eye_tex.image = eye_image
eye_mat.node_tree.links.new(eye_tex.outputs['Color'], eye_shader.inputs['Base Color'])
eyes.data.materials.clear()
eyes.data.materials.append(eye_mat)
for obj in hair:
    obj.hide_render = obj.name != 'BODYFORGE_Hair_swept'
    obj.hide_set(obj.hide_render)
world = scene.world or bpy.data.worlds.new('Studio')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (.05, .065, .09, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = .3
for name, location, energy, size, color in [
    ('Softbox key', (-1.2, -1.6, 2.6), 180, 1.4, (1, .91, .84)),
    ('Softbox fill', (1.5, -.8, 2), 65, 1.6, (.76, .85, 1)),
    ('Softbox rim', (.7, .8, 2.2), 140, .9, (.55, .72, 1)),
]:
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.shape, data.size, data.color = energy, 'DISK', size, color
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector((0, 0, 1.65)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
camera_data = bpy.data.cameras.new('Portrait lens 85mm')
camera = bpy.data.objects.new('Portrait lens 85mm', camera_data)
scene.collection.objects.link(camera)
camera.location = (.28, -1.35, 1.72)
camera.rotation_euler = (Vector((0, 0, 1.68)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera_data.lens = 85
scene.camera = camera
scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 720, 900, 100
scene.view_settings.view_transform = 'AgX'
for image in bpy.data.images:
    if image.source in {'FILE', 'GENERATED'}:
        _ = image.pixels[0]  # Blender loads file images lazily, even after baking.
        image.pack()
        assert image.packed_file is not None
BLEND = ART / 'bodyforge-athlete-realistic.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND), compress=True)
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED
report = {'blender': bpy.app.version_string, 'sourceSha256': EXPECTED, 'sourceUnchanged': True,
          'deformation': deformation_stats, 'headAnchor': list(head),
          'outputs': [{'path': str(p.relative_to(ROOT)), 'bytes': p.stat().st_size,
                       'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
                      for p in [OUTPUT, BLEND] + [ASSETS / n for n in ['athlete-skin-detail.jpg', 'athlete-eyes.jpg', 'athlete-normal.png', 'athlete-orm.png']]]}
(REPORTS / 'BODYFORGE_REALISM_20261027.blender.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
print('REALISM_AUTHOR_PASS ' + json.dumps(report))
