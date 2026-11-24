"""Author BODYFORGE hair geometry against the pinned MakeHuman scalp in Blender."""
import hashlib
import math
from pathlib import Path
import random
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

source, output = map(Path, sys.argv[sys.argv.index('--') + 1:])
assert hashlib.sha256(source.read_bytes()).hexdigest() == 'df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e'
if output.exists():
    raise FileExistsError(output)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
body = bpy.data.objects['BODYFORGE_Body']
scalp = BVHTree.FromPolygons([v.co for v in body.data.vertices],
                            [p.vertices[:] for p in body.data.polygons], all_triangles=True)
centre = Vector((0, -.044, 1.689))


def edge(phi):
    front = max(0.0, math.sin(phi))
    back = max(0.0, -math.sin(phi))
    return 1.36 + .45 * back ** 1.4 - .35 * front ** .65 + .018 * math.sin(phi * 9)


def surface(phi, fraction, lift=0):
    theta = max(.012, fraction * edge(phi))
    direction = Vector((.086 * math.sin(theta) * math.cos(phi),
                        -.103 * math.sin(theta) * math.sin(phi), .085 * math.cos(theta))).normalized()
    hit, _, _, _ = scalp.ray_cast(centre + direction * .24, -direction, .24)
    if hit is None:
        raise RuntimeError(f'No scalp sample at {phi:.3f}, {fraction:.3f}')
    return hit + direction * lift


def groom(style):
    swept = style == 'swept'
    rng = random.Random(20261124 + swept)
    vertices, faces, tones = [], [], []
    sectors, rows = 64, 19
    for row in range(rows + 1):
        t = row / rows
        for sector in range(sectors):
            phi = math.tau * sector / sectors
            loft = (.004 if swept else .0028) * (1 - t * t) + .0009
            vertices.append(surface(phi, t, loft))
            tone = .28 + .18 * t + .035 * math.sin(phi * 22 + t * 14)
            tones.append((tone * .96, tone * .88, tone * .80, 1))
            if row < rows:
                a = row * sectors + sector
                b = row * sectors + ((sector + 1) % sectors)
                faces.append((a, b, b + sectors, a + sectors))
    faces.append(tuple(reversed(range(sectors))))

    # Closed roots and tapered, split-level cards. Large locks supply volume;
    # finer ribbons break the silhouette and catch physically shaded highlights.
    for index in range(144 if swept else 120):
        principal = index < (53 if swept else 41)
        phi = index * 2.399963 + rng.uniform(-.22, .22)
        start_r = rng.uniform(.10, .86)
        front = max(0, math.sin(phi))
        travel = rng.uniform(.13, .42) * (1.15 if swept else .78)
        turn = rng.uniform(-.18, .24) + (0.62 if swept else .28) * front
        width = rng.uniform(.0029, .0052) if principal else rng.uniform(.00044, .00110)
        arch = rng.uniform(.008, .022) if principal else rng.uniform(.006, .020)
        arch *= (.68 + .64 * front) * (1.10 if swept else .77)
        base = len(vertices)
        segments = 9 if principal else 7
        color = rng.uniform(.35, .88) if principal else rng.uniform(.40, .95)

        def curve(t):
            az = phi + turn * t + .11 * math.sin(math.pi * t)
            radius = min(1.055, start_r + travel * t)
            rise = .0018 + arch * math.sin(math.pi * t) ** .82 + .0023 * t
            return surface(az, radius, rise)

        for step in range(segments + 1):
            t = step / segments
            middle = curve(t)
            tangent = (curve(min(1, t + .004)) - curve(max(0, t - .004))).normalized()
            outward = (middle - centre).normalized()
            across = tangent.cross(outward).normalized()
            normal = across.cross(tangent).normalized()
            taper = .045 + .955 * math.sin(math.pi * (.17 + .83 * t)) ** .70
            for side in (-1, 0, 1):
                vertices.append(middle + across * side * width * taper + normal * (1 - abs(side)) * width * taper * .38)
                c = color * (.76 + .24 * (1 - abs(side))) * (.82 + .18 * math.sin(math.pi * t))
                tones.append((c, c * .91, c * .81, 1))
            if step < segments:
                a = base + step * 3
                faces.extend([(a, a + 3, a + 4, a + 1), (a + 1, a + 4, a + 5, a + 2)])

    mesh = bpy.data.meshes.new('BODYFORGE strand groom ' + style)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    color = mesh.color_attributes.new(name='Color', type='BYTE_COLOR', domain='POINT')
    for i, value in enumerate(tones):
        color.data[i].color = value
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new('BODYFORGE_Groom_' + style, mesh)
    bpy.context.collection.objects.link(obj)
    obj.select_set(True)
    return obj


bpy.ops.object.select_all(action='DESELECT')
objects = [groom('crop'), groom('swept')]
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True,
                          export_yup=True, export_animations=False, export_materials='NONE',
                          export_normals=True, export_vertex_color='ACTIVE')
print('BODYFORGE_GROOM', [(obj.name, len(obj.data.vertices), len(obj.data.polygons)) for obj in objects],
      output.stat().st_size, hashlib.sha256(output.read_bytes()).hexdigest())
