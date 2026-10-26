"""Author the derived CC0 BODYFORGE athlete using isolated headless Blender.

Run from the repository root with Blender --background --factory-startup --python.
The original MakeHuman asset is immutable. No camera images or network are used.
"""
import hashlib
import json
import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'public/assets/male-base-mesh-base_male.glb'
OUTPUT = ROOT / 'public/assets/bodyforge-athlete.glb'
EXPECTED_SHA256 = 'd15a07e2b4cf1d08a3b91cb212a9a06a91438077f05a3f2a62f45351e8a71eb8'

if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != EXPECTED_SHA256:
    raise RuntimeError('Pinned CC0 source differs; authoring aborted without modifying it')

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))

print('BODYFORGE_IMPORT', json.dumps([
    {
        'name': obj.name,
        'type': obj.type,
        'vertices': len(obj.data.vertices) if obj.type == 'MESH' else None,
        'faces': len(obj.data.polygons) if obj.type == 'MESH' else None,
        'materials': [slot.material.name if slot.material else None for slot in obj.material_slots],
        'groups': len(obj.vertex_groups) if obj.type == 'MESH' else None,
        'matrix': [list(row) for row in obj.matrix_world],
    } for obj in bpy.context.scene.objects
], ensure_ascii=True))

base = bpy.data.objects['base_male_body']
rig = bpy.data.objects['base_male_body.rig']
source_mesh = base.data
source_normals = [vertex.normal.copy() for vertex in source_mesh.vertices]
group_names = [group.name for group in base.vertex_groups]
source_weights = [[(weight.group, weight.weight) for weight in vertex.groups] for vertex in source_mesh.vertices]
source_uv = source_mesh.uv_layers.active


def material(name, color, roughness=.8):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    shader = result.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = 0
    return result


skin_mat = material('BODYFORGE_Skin', (.55, .32, .21), .72)
lips_mat = material('BODYFORGE_NaturalLips', (.50, .22, .16), .58)
nails_mat = material('BODYFORGE_NaturalNails', (.60, .39, .29), .52)
shirt_mat = material('BODYFORGE_TechnicalKnit', (.009, .014, .022), .82)
shorts_mat = material('BODYFORGE_WovenShorts', (.006, .010, .016), .88)
shoes_mat = material('BODYFORGE_AthleticShoes', (.018, .024, .032), .64)
brows_mat = material('BODYFORGE_NaturalBrows', (.010, .012, .016), .88)
logo_mat = material('BODYFORGE_ChestEmblem', (.42, .57, .65), .45)


def make_skinned(name, faces, assigned_material, garment=None, surface_offset=0):
    """Copy source topology, UVs and exact vertex groups into an owned object."""
    used = sorted({index for face in faces for index in face.vertices})
    remap = {index: new_index for new_index, index in enumerate(used)}
    coords = []
    for index in used:
        vertex = source_mesh.vertices[index]
        coordinate = vertex.co.copy()
        if surface_offset:
            coordinate += source_normals[index] * surface_offset
        if garment:
            # Blender is Z-up; glTF source (x,y,z) becomes (x,-z,y).
            x, height = coordinate.x, coordinate.z
            near_hem = math.exp(-((height - (1.045 if garment == 'shirt' else .755)) / .10) ** 2)
            folds = .0011 * math.sin(height * 67 + abs(x) * 29) * near_hem
            if garment == 'shirt':
                folds += .0006 * math.sin(height * 47 + x * 38) * math.exp(-((abs(x) - .24) / .10) ** 2)
            coordinate += source_normals[index] * (.0065 if garment == 'shoes' else .0048 + folds)
            if garment == 'shoes':
                coordinate.z = max(-.004, coordinate.z)
        coords.append(coordinate)

    polygons = [tuple(remap[index] for index in face.vertices) for face in faces]
    mesh = bpy.data.meshes.new(name + '_Geometry')
    mesh.from_pydata(coords, [], polygons)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(assigned_material)
    if source_uv:
        uv = mesh.uv_layers.new(name='UVMap')
        for target_face, source_face in zip(mesh.polygons, faces):
            for target_loop, source_loop in zip(target_face.loop_indices, source_face.loop_indices):
                uv.data[target_loop].uv = source_uv.data[source_loop].uv
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.normals_split_custom_set_from_vertices([source_normals[index] for index in used])
    for name in group_names:
        obj.vertex_groups.new(name=name)
    for index, source_index in enumerate(used):
        for group, weight in source_weights[source_index]:
            obj.vertex_groups[group].add([index], weight, 'REPLACE')
    modifier = obj.modifiers.new('Original CC0 rig', 'ARMATURE')
    modifier.object = rig
    modifier.use_vertex_groups = True
    obj.parent = rig

    if garment:
        # Garments are a separate 3D shell with a visible, bounded edge thickness.
        # Add thickness only to boundary strips instead of doubling the surface.
        # Weld coincident source UV seam vertices in the garment only. UVs are
        # loop data, so island coordinates remain distinct after welding.
        weld = bmesh.new()
        weld.from_mesh(obj.data)
        bmesh.ops.remove_doubles(weld, verts=list(weld.verts), dist=.000001)
        weld.to_mesh(obj.data)
        weld.free()
        obj.data.update()
        if garment == 'shoes':
            # Convex envelopes hide individual toes and keep a trainer-like
            # silhouette. Every hull vertex still carries source foot weights.
            hull = bmesh.new()
            hull.from_mesh(obj.data)
            for face in list(hull.faces):
                hull.faces.remove(face)
            for edge in list(hull.edges):
                hull.edges.remove(edge)
            for sign in (-1, 1):
                points = [vertex for vertex in hull.verts if vertex.co.x * sign > 0]
                bmesh.ops.convex_hull(hull, input=points, use_existing_faces=False)
            for vertex in list(hull.verts):
                if not vertex.link_faces:
                    hull.verts.remove(vertex)
            hull.normal_update()
            uv_layer = hull.loops.layers.uv.verify()
            for face in hull.faces:
                face.smooth = True
                for loop in face.loops:
                    loop[uv_layer].uv = (abs(loop.vert.co.x) * 5, -loop.vert.co.y * 4)
            hull.to_mesh(obj.data)
            hull.free()
            obj.data.update()
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        if garment != 'shoes':
            decimate = obj.modifiers.new('Mobile garment topology', 'DECIMATE')
            decimate.ratio = .52
            bpy.ops.object.modifier_move_up(modifier=decimate.name)
            bpy.ops.object.modifier_apply(modifier=decimate.name)
        else:
            bevel = obj.modifiers.new('Rounded trainer edges', 'BEVEL')
            bevel.width = .002
            bevel.segments = 2
            bevel.limit_method = 'ANGLE'
            bevel.angle_limit = .38
            bpy.ops.object.modifier_move_up(modifier=bevel.name)
            bpy.ops.object.modifier_apply(modifier=bevel.name)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.normal_update()
        boundary = [edge for edge in bm.edges if len(edge.link_faces) == 1]
        neighbours = {}
        for edge in boundary:
            a, b = edge.verts
            neighbours.setdefault(a, []).append(b)
            neighbours.setdefault(b, []).append(a)
        # Centroid face selection follows the original tessellation, so its
        # cut edge needs a geometric finish. Smooth tangentially, then project
        # back onto the measured body to prevent a collar from sinking into it.
        if garment != 'shoes':
            for _ in range(12):
                updates = {}
                for vertex, adjacent in neighbours.items():
                    average = sum((other.co for other in adjacent), vertex.co * 0) / len(adjacent)
                    candidate = vertex.co.lerp(average, .62)
                    point, normal, _, _ = body_surface.find_nearest(candidate)
                    if point is not None:
                        updates[vertex] = point + normal * .0052
                for vertex, coordinate in updates.items():
                    vertex.co = coordinate
            bm.normal_update()
        layer = bm.verts.layers.deform.verify()
        uv_layer = bm.loops.layers.uv.active
        inward = {}
        for edge in boundary:
            for vertex in edge.verts:
                if vertex not in inward:
                    inside = bm.verts.new(vertex.co - vertex.normal * .0014)
                    for group, weight in vertex[layer].items():
                        inside[layer][group] = weight
                    inward[vertex] = inside
        for edge in boundary:
            # Match the neighbouring face's boundary direction, then reverse
            # it for a correctly facing strip around neckline and hems.
            loop = next(loop for loop in edge.link_faces[0].loops if loop.edge == edge)
            first, second = loop.vert, loop.link_loop_next.vert
            face = bm.faces.new((second, first, inward[first], inward[second]))
            face.smooth = True
            if uv_layer:
                a, b = loop[uv_layer].uv.copy(), loop.link_loop_next[uv_layer].uv.copy()
                for rim_loop, uv_value in zip(face.loops, (b, a, a, b)):
                    rim_loop[uv_layer].uv = uv_value
        bm.normal_update()
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
        # Decimation interpolates memberships. Export exactly four normalized
        # weights per new vertex so browser skinning has a bounded contract.
        for vertex in obj.data.vertices:
            top = sorted([(membership.group, membership.weight) for membership in vertex.groups],
                         key=lambda pair: pair[1], reverse=True)[:4]
            total = sum(weight for _, weight in top)
            if total <= 0:
                raise RuntimeError('Garment vertex lost its original rig weights')
            for membership in list(vertex.groups):
                obj.vertex_groups[membership.group].remove([vertex.index])
            for group, weight in top:
                obj.vertex_groups[group].add([vertex.index], weight / total, 'REPLACE')
        obj.select_set(False)
    return obj


# The importer concatenates the original six primitives. Validate each range
# before splitting, so a future import/layout change cannot silently mislabel it.
ranges = [
    ('BODYFORGE_Body', 0, 63750, skin_mat),
    ('BODYFORGE_SkinNipples', 63750, 64207, skin_mat),
    ('BODYFORGE_Lips', 64207, 66417, lips_mat),
    ('BODYFORGE_NailsHands', 66417, 67056, nails_mat),
    ('BODYFORGE_NailsFeet', 67056, 68251, nails_mat),
    ('BODYFORGE_SkinEars', 68251, 71695, skin_mat),
]
if len(source_mesh.vertices) != 71695:
    raise RuntimeError('GLB importer changed vertex topology')
objects = []
for name, start, end, assigned_material in ranges:
    faces = [face for face in source_mesh.polygons if all(start <= index < end for index in face.vertices)]
    if not faces:
        raise RuntimeError('Missing source primitive ' + name)
    objects.append(make_skinned(name, faces, assigned_material))


def shirt_face(face):
    points = [source_mesh.vertices[index].co for index in face.vertices]
    x = sum(point.x for point in points) / len(points)
    height = sum(point.z for point in points) / len(points)
    depth = -sum(point.y for point in points) / len(points)
    ax = abs(x)
    # Measured sections: shoulders still reach x=+/-0.107 at y=1.52;
    # the true neck narrows to x=+/-0.073 only near y=1.54. A low cut at
    # y=1.49/1.50 exposed the upper shoulders and formed a wide boat neck.
    front = max(0, min(1, (depth - .005) / .10))
    collar_height = 1.545 - .020 * front
    if not (1.005 <= height <= min(1.56, collar_height)):
        return False
    if height > 1.535 and (x / .070) ** 2 + ((depth - .020) / .080) ** 2 < 1:
        return False
    radius = .328 if height > 1.34 else .29 if height > 1.15 else .255
    sleeve = 1.28 <= height <= 1.46 and ax <= .415
    return ax <= radius or sleeve


def shorts_face(face):
    points = [source_mesh.vertices[index].co for index in face.vertices]
    x = sum(point.x for point in points) / len(points)
    height = sum(point.z for point in points) / len(points)
    return .730 <= height <= 1.025 and abs(x) < .275


body_faces = [face for face in source_mesh.polygons if all(index < 63750 for index in face.vertices)]
body_surface = BVHTree.FromPolygons(
    [vertex.co for vertex in source_mesh.vertices],
    [list(face.vertices) for face in body_faces], all_triangles=True,
)
objects.append(make_skinned('BODYFORGE_Shirt', [face for face in body_faces if shirt_face(face)], shirt_mat, 'shirt'))
objects.append(make_skinned('BODYFORGE_Shorts', [face for face in body_faces if shorts_face(face)], shorts_mat, 'shorts'))
objects.append(make_skinned('BODYFORGE_Shoes', [face for face in body_faces
    if sum(source_mesh.vertices[index].co.z for index in face.vertices) / len(face.vertices) < .105], shoes_mat, 'shoes'))


def brow_ribbons():
    # Continuous ribbons avoid the scattered boundary of selected source faces.
    # Project each edge onto the actual face, with a sub-millimetre normal offset.
    vertices, normals, faces, weights, uv_values = [], [], [], [], []
    segments = 16
    for sign in (-1, 1):
        start = len(vertices)
        for step in range(segments + 1):
            t = step / segments
            x = sign * (.015 + .040 * t)
            arch = 1.690 + .004 * math.sin(math.pi * t)
            for edge in (-1, 1):
                height = arch + edge * .0015
                point, normal, face_index, _ = body_surface.ray_cast(
                    Vector((x, -.4, height)), Vector((0, 1, 0)), .5,
                )
                if point is None or face_index is None or normal.y > -.05:
                    raise RuntimeError('Brow projection did not hit the front anatomical face')
                nearest = min(body_faces[face_index].vertices,
                              key=lambda index: (source_mesh.vertices[index].co - point).length_squared)
                vertices.append(point + normal * .0007)
                normals.append(normal)
                weights.append(source_weights[nearest])
                uv_values.append((t, 0 if edge == -1 else 1))
        for step in range(segments):
            a = start + step * 2
            face = (a, a + 2, a + 3, a + 1)
            faces.append(tuple(reversed(face)) if sign == -1 else face)
    mesh = bpy.data.meshes.new('BODYFORGE_Brows_Geometry')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name='UVMap')
    for polygon in mesh.polygons:
        polygon.use_smooth = True
        for loop_index in polygon.loop_indices:
            uv.data[loop_index].uv = uv_values[mesh.loops[loop_index].vertex_index]
    mesh.normals_split_custom_set_from_vertices(normals)
    obj = bpy.data.objects.new('BODYFORGE_Brows', mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(brows_mat)
    for name in group_names:
        obj.vertex_groups.new(name=name)
    for index, vertex_weights in enumerate(weights):
        for group, weight in vertex_weights:
            obj.vertex_groups[group].add([index], weight, 'REPLACE')
    modifier = obj.modifiers.new('Original CC0 rig', 'ARMATURE')
    modifier.object = rig
    obj.parent = rig
    return obj


objects.append(brow_ribbons())


def chest_emblem():
    # An original asymmetric kinetic mark, modelled as three tiny raised fins.
    # Every point projects onto the source chest and inherits its skin weights.
    polygons = [
        [(-.087, 1.395), (-.057, 1.405), (-.066, 1.394), (-.086, 1.387)],
        [(-.085, 1.384), (-.067, 1.391), (-.075, 1.380), (-.085, 1.376)],
    ]
    vertices, faces, weights = [], [], []
    candidates = [vertex for vertex in source_mesh.vertices[:63750]
                  if -.12 < vertex.co.x < -.035 and 1.35 < vertex.co.z < 1.45 and vertex.co.y < -.04]
    for polygon in polygons:
        indices = []
        for x, height in polygon:
            nearest = min(candidates, key=lambda vertex: (vertex.co.x - x) ** 2 + (vertex.co.z - height) ** 2)
            indices.append(len(vertices))
            vertices.append((x, nearest.co.y - .0065, height))
            weights.append(source_weights[nearest.index])
        faces.append(tuple(indices))
    mesh = bpy.data.meshes.new('BODYFORGE_ChestMark_Geometry')
    # Front faces point towards Blender -Y (glTF +Z).
    mesh.from_pydata(vertices, [], [tuple(reversed(face)) for face in faces])
    mesh.update()
    obj = bpy.data.objects.new('BODYFORGE_ChestMark', mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(logo_mat)
    for name in group_names:
        obj.vertex_groups.new(name=name)
    for index, vertex_weights in enumerate(weights):
        for group, weight in vertex_weights:
            obj.vertex_groups[group].add([index], weight, 'REPLACE')
    modifier = obj.modifiers.new('Original CC0 rig', 'ARMATURE')
    modifier.object = rig
    obj.parent = rig
    return obj


objects.append(chest_emblem())
eyes = bpy.data.objects['base_male_body.high-poly']
eyes.name = 'BODYFORGE_Eyes'
objects.append(eyes)

bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for obj in objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT), export_format='GLB', use_selection=True,
    export_yup=True, export_animations=False, export_skins=True,
    export_all_influences=False, export_def_bones=False,
    export_materials='EXPORT', export_texcoords=True, export_normals=True,
)

print('BODYFORGE_AUTHORED', json.dumps({
    'source_sha256': EXPECTED_SHA256,
    'output': str(OUTPUT.relative_to(ROOT)),
    'bytes': OUTPUT.stat().st_size,
    'sha256': hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
    'objects': [{'name': obj.name, 'vertices': len(obj.data.vertices),
                 'faces': len(obj.data.polygons)} for obj in objects],
}, ensure_ascii=True))
