"""Render the packed source in a factory-startup background Blender process."""
from pathlib import Path
import bpy

root = Path(__file__).resolve().parents[1]
for image in bpy.data.images:
    if image.source in {'FILE', 'GENERATED'} and image.users > 0:
        assert image.packed_file is not None, 'Source image is not packed: ' + image.name
bpy.context.scene.cycles.samples = 48
bpy.context.scene.cycles.use_denoising = True
bpy.context.scene.render.image_settings.file_format = 'PNG'
bpy.context.scene.render.filepath = str(root / '.iskra/reports/BODYFORGE_REALISM_20261027-studio.png')
bpy.ops.render.render(write_still=True)
print('REALISM_STUDIO_RENDER_PASS')
