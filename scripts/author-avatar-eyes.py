"""Bake a fitted PBR eye upgrade for the pinned BODYFORGE athlete in Blender.

Invoke with Blender --background --factory-startup --python ... -- SOURCE OUT.
The GLB borrows the exact original vertex and triangle order so the web client
can reuse the original joint indices, weights, bones, and inverse bind matrices.
"""
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import zlib

import bpy
from mathutils.bvhtree import BVHTree
from mathutils import Vector
import numpy as np

SOURCE_SHA = 'df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e'
EYE_X, EYE_Y = .03024, 1.67578
ATLAS_SIZE_M = .036
PIXELS_PER_EYE = 192


def png(rgb):
    """Deterministic RGB PNG. glTF determines the color space per slot."""
    def chunk(name, content):
        return struct.pack('>I', len(content)) + name + content + struct.pack('>I', zlib.crc32(name + content))

    height, width, _ = rgb.shape
    pixels = np.rint(np.clip(rgb, 0, 1) * 255).astype(np.uint8)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(b''.join(b'\0' + row.tobytes() for row in pixels), 9))
            + chunk(b'IEND', b''))


def smooth(edge0, edge1, value):
    t = np.clip((value - edge0) / (edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)


def mix(a, b, weight):
    return a + (b - a) * weight[..., None]


def paint(sign):
    # Coordinates match the projection below. The reflections are authored by
    # the PBR material at runtime; there is no painted catchlight in the pupil.
    axis = (np.arange(PIXELS_PER_EYE) + .5) / PIXELS_PER_EYE - .5
    x, y = np.meshgrid(axis * ATLAS_SIZE_M, -axis * ATLAS_SIZE_M)
    radius = np.hypot(x, y)
    r = radius / .00582
    theta = np.arctan2(y, sign * x)
    phase = .35 if sign > 0 else -.19
    fibres = .50 + .15 * np.sin(39 * theta + 5 * r + phase) + .12 * np.sin(76 * theta - 8 * r)
    fibres += .10 * np.sin(113 * theta + 34 * r + 2 * np.sin(11 * theta))
    fibres += .06 * np.sin(164 * theta - 23 * r + phase)
    crypts = .10 * np.sin(13 * theta + 29 * r) * np.exp(-((r - .66) / .25) ** 2)
    collarette = .18 * np.exp(-((r - (.53 + .06 * np.sin(31 * theta))) / .10) ** 2)
    iris = mix(np.array([.185, .111, .073]), np.array([.62, .419, .251]), np.clip(fibres + crypts + collarette, 0, 1))
    iris = mix(iris, np.array([.145, .112, .094]), smooth(.83, .99, r) * .82)
    iris = mix(iris, np.array([.036, .026, .023]), 1 - smooth(.335, .365, r))

    edge = smooth(.007, .016, radius)
    nasal = smooth(.003, .016, -sign * x)
    vertical_shadow = smooth(.0002, .0065, y) * .30
    sclera = mix(np.array([.774, .739, .704]), np.array([.593, .474, .424]), .49 * edge + .25 * nasal + vertical_shadow)
    # Fine branching pigmentation toward the canthus. It fades away from the
    # rim, so the texture reads as an off-white surface at mobile distances.
    vein_angle = theta + .13 * np.sin(410 * radius + phase) + .075 * np.sin(870 * radius + 3 * theta)
    veins = np.maximum(0, np.sin(13 * vein_angle + phase)) ** 28
    veins *= smooth(.009, .015, radius) * (.25 + .75 * nasal)
    sclera = mix(sclera, np.array([.55, .30, .28]), .23 * veins)

    iris_weight = 1 - smooth(.985, 1.045, r)
    rgb = mix(sclera, iris, iris_weight)
    cornea = 1 - smooth(.68, 1.30, r)
    glaze = .20 + .67 * cornea
    roughness = .32 - .155 * cornea + .055 * edge
    # glTF uses R for clearcoat and G for both roughness slots.
    orm = np.stack((glaze, roughness, np.zeros_like(r)), axis=-1)
    return rgb, orm


def source_primitive(raw):
    json_length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + json_length])
    blob = raw[28 + json_length:]
    node = next(n for n in doc['nodes'] if n.get('name') == 'BODYFORGE_Eyes')
    primitive, = doc['meshes'][node['mesh']]['primitives']

    def read(index, dtype, components):
        a = doc['accessors'][index]
        view = doc['bufferViews'][a['bufferView']]
        width = np.dtype(dtype).itemsize
        return np.ndarray((a['count'], components), dtype=dtype, buffer=blob,
                          offset=view.get('byteOffset', 0) + a.get('byteOffset', 0),
                          strides=(view.get('byteStride', width * components), width)).copy()

    attrs = primitive['attributes']
    return read(attrs['POSITION'], '<f4', 3), read(attrs['NORMAL'], '<i2', 3) / 32767, read(primitive['indices'], '<u2', 1)


def shape_globe(rest, normal):
    # A small continuous cap over the original cornea. The envelope and its
    # derivative go to zero well before the lid. Positions are glTF metres.
    sign = np.sign(rest[:, 0])
    x, y = rest[:, 0] - EYE_X * sign, rest[:, 1] - EYE_Y
    d = .0072
    envelope = np.maximum(0., 1 - (x * x + y * y) / (d * d))
    t = np.clip((rest[:, 2] - .1385) / .005, 0, 1)
    front = t * t * (3 - 2 * t)
    amplitude = .00083
    offset = amplitude * envelope ** 3 * front
    derivative = -6 * amplitude * envelope ** 2 * front / (d * d)
    dz_dz = amplitude * envelope ** 3 * 6 * t * (1 - t) / .005
    # Inverse transpose Jacobian for the original split normals.
    n = normal.copy()
    n[:, 2] /= 1 + dz_dz
    n[:, 0] -= derivative * x * n[:, 2]
    n[:, 1] -= derivative * y * n[:, 2]
    n /= np.linalg.norm(n, axis=1)[:, None]
    position = rest.copy()
    position[:, 2] += offset
    uv = np.stack((.25 + .5 * (sign > 0) + .5 * x / ATLAS_SIZE_M, .5 - y / ATLAS_SIZE_M), axis=1)
    assert np.max(offset) < .00084 and np.count_nonzero(offset > .0001) > 100
    assert np.min(uv) >= 0 and np.max(uv) <= 1
    return position, n, uv, offset


def validate_fit(source, rest, position, offset):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    body = bpy.data.objects['BODYFORGE_Body'].data
    eyes = bpy.data.objects['BODYFORGE_Eyes'].data
    assert len(eyes.vertices) == len(rest) == 1076
    # Blender's object uses Z up, -Y forward. Check the original and edited
    # surfaces against the facial mesh through the frontal aperture.
    bvh = BVHTree.FromPolygons([v.co for v in body.vertices], [p.vertices[:] for p in body.polygons], all_triangles=True)
    formerly_hidden = 0
    for vertex, after, delta in zip(rest, position, offset):
        if delta < .00002:
            continue
        x, h, front = map(float, vertex)
        hit, *_ = bvh.ray_cast(Vector((x, -.22, h)), Vector((0, 1, 0)), .10)
        if hit is None:
            continue
        occluder = -hit.y
        if occluder > front + 1e-5:
            formerly_hidden += 1
            if occluder < after[2] + .00006:
                # Feather the edit back toward the existing hidden surface at
                # individual lid-contact vertices. Never expose a hidden vertex.
                after[2] = min(after[2], max(front, occluder - .00006))
    return formerly_hidden


def make_glb(position, normals, uvs, indices, pigment, orm):
    bin_data, views, accessors = bytearray(), [], []

    def view(data, target=None):
        bin_data.extend(b'\0' * ((-len(bin_data)) % 4))
        meta = {'buffer': 0, 'byteOffset': len(bin_data), 'byteLength': len(data)}
        if target:
            meta['target'] = target
        views.append(meta)
        bin_data.extend(data)
        return len(views) - 1

    for array, shape, component in [(position, 'VEC3', 5126), (normals, 'VEC3', 5126), (uvs, 'VEC2', 5126), (indices, 'SCALAR', 5123)]:
        dtype = '<f4' if component == 5126 else '<u2'
        a = {'bufferView': view(array.astype(dtype).tobytes(), 34962 if component == 5126 else 34963),
             'componentType': component, 'count': len(array), 'type': shape}
        if array is position:
            a.update(min=position.min(axis=0).tolist(), max=position.max(axis=0).tolist())
        accessors.append(a)
    images = [{'mimeType': 'image/png', 'bufferView': view(png(image))} for image in [pigment, orm]]
    bin_data.extend(b'\0' * ((-len(bin_data)) % 4))
    doc = {'asset': {'version': '2.0', 'generator': f'BODYFORGE / Blender {bpy.app.version_string}'},
           'extras': {'sourceSha256': SOURCE_SHA}, 'scene': 0, 'scenes': [{'nodes': [0]}],
           'nodes': [{'mesh': 0, 'name': 'BODYFORGE_OcularDetail'}],
           'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'TEXCOORD_0': 2}, 'indices': 3, 'material': 0}]}],
           'images': images, 'textures': [{'source': 0, 'sampler': 0}, {'source': 1, 'sampler': 0}],
           'samplers': [{'minFilter': 9987, 'magFilter': 9729, 'wrapS': 33071, 'wrapT': 33071}],
           'extensionsUsed': ['KHR_materials_clearcoat', 'KHR_materials_ior', 'KHR_materials_specular'],
           'materials': [{'name': 'BODYFORGE iris, sclera and tear film',
                          'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0,
                                                  'roughnessFactor': 1, 'metallicRoughnessTexture': {'index': 1}},
                          'extensions': {'KHR_materials_ior': {'ior': 1.376}, 'KHR_materials_specular': {'specularFactor': .42},
                              'KHR_materials_clearcoat': {
                              'clearcoatFactor': .42, 'clearcoatTexture': {'index': 1},
                              'clearcoatRoughnessFactor': .62, 'clearcoatRoughnessTexture': {'index': 1}}}}],
           'buffers': [{'byteLength': len(bin_data)}], 'bufferViews': views, 'accessors': accessors}
    encoded = json.dumps(doc, separators=(',', ':')).encode('utf8')
    encoded += b' ' * ((-len(encoded)) % 4)
    return (struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(bin_data))
            + struct.pack('<I4s', len(encoded), b'JSON') + encoded
            + struct.pack('<I4s', len(bin_data), b'BIN\0') + bin_data)


def main():
    source, output = map(Path, sys.argv[sys.argv.index('--') + 1:])
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA:
        raise ValueError('The eye fit requires the pinned athlete GLB')
    if output.exists():
        raise FileExistsError(output)
    rest, normal, index = source_primitive(raw)
    pos, normals, uvs, offset = shape_globe(rest, normal)
    hidden = validate_fit(source, rest, pos, offset)
    left, right = paint(-1), paint(1)
    blob = make_glb(pos, normals, uvs, index, np.concatenate([left[0], right[0]], axis=1),
                    np.concatenate([left[1], right[1]], axis=1))
    assert len(blob) <= 145_000
    with output.open('xb') as stream:
        stream.write(blob)
    print('BODYFORGE_OCULAR_QC', json.dumps({'fileBytes': len(blob), 'sha256': hashlib.sha256(blob).hexdigest(),
          'triangles': len(index) // 3, 'vertexCount': len(rest), 'lidContactSamples': hidden,
          'peakCorneaDisplacementMm': round(float(np.max(pos[:, 2] - rest[:, 2])) * 1000, 3)}))


if __name__ == '__main__':
    main()
