"""Build the mobile skin albedo with Blender, without third-party Python packages.

Run from the repository root:
  blender --background --factory-startup --python scripts/prepare-athlete-texture.py

The downloaded CC0 source is private and intentionally not committed. See the
public provenance note for the exact upstream archive member and source hash.
"""

from pathlib import Path
import hashlib
import json

import bpy


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / '.iskra/reports/athlete-source/young_lightskinned_male_diffuse.png'
TARGET = ROOT / 'public/assets/athlete-skin.jpg'
SOURCE_SHA256 = '862a26e335e958b70534cb5f0d7c47ef30ab148a56c42b3e9da969cf76f12963'

assert SOURCE.is_file(), f'Download the documented source first: {SOURCE}'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == SOURCE_SHA256, 'Unexpected source bytes'
assert TARGET.parent.is_dir(), 'Expected existing app asset directory'

image = bpy.data.images.load(str(SOURCE), check_existing=False)
assert tuple(image.size) == (2048, 2048), tuple(image.size)
image.colorspace_settings.name = 'sRGB'
image.scale(1024, 1024)

# Standard is a linear-to-sRGB display transform. An AgX/Filmic view transform
# would alter the albedo, which must be retained for the real-time material.
scene = bpy.context.scene
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
scene.render.image_settings.file_format = 'JPEG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.image_settings.color_depth = '8'
scene.render.image_settings.quality = 90
image.save_render(str(TARGET), scene=scene)
bpy.data.images.remove(image)

readback = bpy.data.images.load(str(TARGET), check_existing=False)
assert tuple(readback.size) == (1024, 1024), tuple(readback.size)
assert TARGET.stat().st_size < 300_000, 'Texture exceeds the mobile byte budget'
result = {
    'source': str(SOURCE.relative_to(ROOT)),
    'source_sha256': SOURCE_SHA256,
    'output': str(TARGET.relative_to(ROOT)),
    'dimensions': list(readback.size),
    'bytes': TARGET.stat().st_size,
    'sha256': hashlib.sha256(TARGET.read_bytes()).hexdigest(),
    'quality': 90,
    'color_space': 'sRGB',
    'source_unchanged': hashlib.sha256(SOURCE.read_bytes()).hexdigest() == SOURCE_SHA256,
    'blender_version': bpy.app.version_string,
    'readback': 'PASS',
}
bpy.data.images.remove(readback)
print('ATHLETE_TEXTURE_QC ' + json.dumps(result))
