"""Bake a subtle original stubble pattern into the pinned CC0 athlete UV atlas."""
import hashlib
from pathlib import Path
import sys

import bpy
import numpy as np

model, albedo, output = map(Path, sys.argv[sys.argv.index('--') + 1:])
assert hashlib.sha256(model.read_bytes()).hexdigest() == 'df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e'
assert hashlib.sha256(albedo.read_bytes()).hexdigest() == 'e5d5d5d7eee9568b386ad4a4457714dace161c11fa45f9dd6161a437fc6deaec'
if output.exists():
    raise FileExistsError(output)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(model))
mesh = bpy.data.objects['BODYFORGE_Body'].data
mesh.calc_loop_triangles()
uv = mesh.uv_layers.active.uv
image = bpy.data.images.load(str(albedo))
width, height = image.size
assert width == height == 2048
coverage = np.zeros((height, width), dtype=np.float32)
noise = np.random.default_rng(20261124).random((height, width), dtype=np.float32)


def beard(x, front, h):
    x = np.abs(x)
    # Density envelopes in bind-pose metres. Leave the lip seam and nose
    # untreated, and make cheek coverage lighter than the chin and moustache.
    chin = .48 * np.exp(-((h - 1.561) / .026) ** 4 - (x / .048) ** 4)
    lip = (x < .034) & (h > 1.584) & (h < 1.615)
    moustache = .46 * np.exp(-((h - (1.617 - .13 * x)) / .007) ** 2 - ((x - .023) / .018) ** 4)
    jaw_height = 1.564 + .83 * np.maximum(0, x - .029)
    jaw = .29 * np.exp(-((h - jaw_height) / .021) ** 2 - ((x - .051) / .026) ** 4)
    cheek = .18 * np.exp(-((h - 1.628) / .031) ** 2 - ((x - .067) / .018) ** 4)
    front_weight = np.clip((front - .052) / .04, 0, 1)
    return np.where(lip, 0, np.minimum(.54, chin + moustache + jaw + cheek) * front_weight)


for face in mesh.loop_triangles:
    points = np.array([mesh.vertices[i].co[:] for i in face.vertices])
    if points[:, 2].max() < 1.525 or points[:, 2].min() > 1.669 or -points[:, 1].min() < .052:
        continue
    texels = np.array([tuple(uv[i].vector) for i in face.loops]) * [width, height] - .5
    origin = np.maximum(0, np.ceil(texels.min(axis=0)).astype(int))
    end = np.minimum([width - 1, height - 1], np.floor(texels.max(axis=0)).astype(int))
    if (end < origin).any():
        continue
    basis = (texels[1:] - texels[0]).T
    if abs(np.linalg.det(basis)) < 1e-8:
        continue
    xx, yy = np.meshgrid(np.arange(origin[0], end[0] + 1), np.arange(origin[1], end[1] + 1))
    u, v = np.linalg.inv(basis) @ (np.stack((xx.ravel(), yy.ravel())) - texels[0, :, None])
    keep = (u >= -1e-6) & (v >= -1e-6) & (u + v <= 1.000001)
    xi, yi = xx.ravel()[keep], yy.ravel()[keep]
    pos = points[0] + u[keep, None] * (points[1] - points[0]) + v[keep, None] * (points[2] - points[0])
    density = beard(pos[:, 0], -pos[:, 1], pos[:, 2])
    coverage[yi, xi] = np.maximum(coverage[yi, xi], density)

# The atlas is linear inside Blender. Subtle broad tint survives mobile mips,
# while sparse sub-millimetre follicles remain visible in a close portrait.
mask = coverage * (.33 + .67 * np.maximum(0, noise - .66) / .34)
pixels = np.empty(width * height * 4, dtype=np.float32)
image.pixels.foreach_get(pixels)
pixels = pixels.reshape(height, width, 4)
pixels[:, :, :3] *= 1 - mask[:, :, None] * np.array([1.0, .86, .77], dtype=np.float32)
assert np.count_nonzero(coverage > .04) > 1000
image.pixels.foreach_set(pixels.ravel())
image.filepath_raw = str(output)
image.file_format = 'JPEG'
image.save(quality=94)
print('BODYFORGE_PORTRAIT_SKIN', output.stat().st_size, hashlib.sha256(output.read_bytes()).hexdigest(),
      'textured face texels', int(np.count_nonzero(coverage > .04)))
