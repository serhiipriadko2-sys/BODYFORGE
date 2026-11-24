"""Review the live facial form on the pinned athlete with Blender's actual mesh.

Pass BODY_GLB OCULAR_GLB PROFILE_JSON UNIQUE_OUTPUT_BLEND after --.
The browser uses the same compact profile and updates the original skin mesh.
"""
import hashlib
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import numpy as np


def to_gltf(points):
    return points[:, [0, 2, 1]] * [1, 1, -1]


def to_blender(points):
    return points[:, [0, 2, 1]] * [1, -1, 1]


def positions(mesh):
    return np.array([vertex.co[:] for vertex in mesh.vertices], dtype=np.float64)


def deform(points, zones):
    p = to_gltf(points)
    x, y, z = p.T
    side = np.where(x < 0, -1, 1)
    eligible = (y >= 1.55) & (y <= 1.72) & (np.abs(x) <= .08) & (z >= .075)
    delta = np.zeros_like(p)
    for zone in zones:
        cx, cy, cz = zone['center']
        rx, ry, rz = zone['radius']
        ux, uy, uz = (x - side * cx) / rx, (y - cy) / ry, (z - cz) / rz
        weight = np.maximum(0, 1 - ux ** 2 - uy ** 2 - uz ** 2) ** 3 * eligible
        dx, dy, dz = zone['offset']
        delta += weight[:, None] * np.stack((side * dx, np.full_like(x, dy), np.full_like(x, dz)), axis=1)
    return to_blender(p + delta), delta


def bvh(points, mesh):
    return BVHTree.FromPolygons(points.tolist(), [poly.vertices[:] for poly in mesh.polygons], all_triangles=True)


def aperture(old, newer, eye):
    direction = Vector((0, 1, 0))
    before, after, opened, closed = 0, 0, 0, 0
    for x in np.linspace(.014, .046, 129):
        for h in np.linspace(1.661, 1.693, 129):
            for sign in (-1, 1):
                ray = Vector((sign * x, -.24, h))
                ocular = eye.ray_cast(ray, direction, .2)[3]
                if ocular is None:
                    continue
                front_old = old.ray_cast(ray, direction, .22)[3]
                front_new = newer.ray_cast(ray, direction, .22)[3]
                a = front_old is None or ocular < front_old - 1e-6
                b = front_new is None or ocular < front_new - 1e-6
                before += int(a)
                after += int(b)
                opened += int(not a and b)
                closed += int(a and not b)
    assert before > 1000
    assert (opened + closed) / before < .022, (before, after, opened, closed)
    return dict(before=before, after=after, newlyExposed=opened, newlyCovered=closed)


def main():
    model, ocular, profile_path, target = map(Path, sys.argv[sys.argv.index('--') + 1:])
    profile = json.loads(profile_path.read_text(encoding='utf8'))
    assert hashlib.sha256(model.read_bytes()).hexdigest() == profile['sourceSha256']
    assert hashlib.sha256(ocular.read_bytes()).hexdigest() == 'bb558f02e88846add66bf4007b9038844eae9cec7f532aef8005bb453a7bbb39'
    if target.exists():
        raise FileExistsError(target)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(model))
    bpy.ops.import_scene.gltf(filepath=str(ocular))
    body = bpy.data.objects['BODYFORGE_Body']
    brows = bpy.data.objects['BODYFORGE_Brows']
    eye = bpy.data.objects['BODYFORGE_OcularDetail']
    assert len(body.data.vertices) == profile['bodyVertices'] and len(brows.data.vertices) == profile['browVertices']
    old = positions(body.data)
    new, delta = deform(old, profile['zones'])
    changed = int(np.count_nonzero(np.linalg.norm(delta, axis=1) > .00005))
    peak = float(np.max(np.linalg.norm(delta, axis=1)))
    assert 100 < changed < 15000 and .002 < peak < .005
    samples = aperture(bvh(old, body.data), bvh(new, body.data), bvh(positions(eye.data), eye.data))

    for obj in (body, brows):
        obj.shape_key_add(name='Basis')
        key = obj.shape_key_add(name='BODYFORGE Face Form')
        sculpted, _ = deform(positions(obj.data), profile['zones'])
        for vertex, point in zip(key.data, sculpted):
            vertex.co = point
        key.value = 1
    bpy.data.objects['BODYFORGE_Eyes'].hide_set(True)
    bpy.data.objects['BODYFORGE_Eyes'].hide_render = True
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(target), compress=True)
    print('BODYFORGE_FACE_FORM_QC', json.dumps(dict(changedVertices=changed, peakMm=round(peak * 1000, 3),
          aperture=samples, sceneBytes=target.stat().st_size, sceneSha256=hashlib.sha256(target.read_bytes()).hexdigest())))


if __name__ == '__main__':
    main()
