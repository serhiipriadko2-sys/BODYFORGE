"""Independent packed-source QC and unretouched Blender crop/swept previews."""
from pathlib import Path
import hashlib
import json
import bpy
import numpy as np

root = Path(__file__).resolve().parents[1]
scene = bpy.context.scene
packed = []
for image in bpy.data.images:
    if image.source in {'FILE', 'GENERATED'} and image.users > 0:
        assert image.packed_file is not None, 'Unpacked image: ' + image.name
        assert len(image.pixels) > 0
        packed.append({'name': image.name, 'size': list(image.size), 'packed': True})
        if image.name == 'Athlete groom albedo alpha':
            pixels = np.array(image.pixels[:]).reshape(-1, 4)
            assert pixels[:, 3].min() < .01 and pixels[:, 3].max() > .99
            assert np.count_nonzero((pixels[:, 3] > .1) & (pixels[:, 3] < .9)) > 100
            assert np.std(pixels[:, 0]) > .05
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.image_settings.file_format = 'PNG'
shots = []
for style in ['crop', 'swept']:
    for obj in bpy.data.objects:
        if obj.name.startswith('BODYFORGE_Hair_'):
            obj.hide_render = obj.name != 'BODYFORGE_Hair_' + style
            obj.hide_set(obj.hide_render)
    target = root / ('.iskra/reports/BODYFORGE_DETAIL_20261027-studio-' + style + '.png')
    scene.render.filepath = str(target)
    bpy.ops.render.render(write_still=True)
    shots.append({'path': str(target.relative_to(root)), 'bytes': target.stat().st_size,
                  'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
report = {'packedImages': packed, 'screenshotsAre': 'offline Cycles previews, not application screenshots', 'shots': shots}
(root / '.iskra/reports/BODYFORGE_DETAIL_20261027.source-qc.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
print('DETAIL_SOURCE_QC_PASS')
