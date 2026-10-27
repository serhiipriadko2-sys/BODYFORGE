"""Pure regression checks; never imports Blender or rebuilds derived assets."""
from pathlib import Path
import json
import shutil
import subprocess
import sys
import tempfile
import unittest

from athlete_groom_inputs import verify_groom_inputs

ROOT = Path(__file__).resolve().parents[1]
INPUTS = ROOT / 'art/sources/athlete-groom'


class GroomInputsTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='bodyforge-groom-inputs-')
        self.addCleanup(self.temporary.cleanup)
        self.inputs = Path(self.temporary.name) / 'inputs'
        shutil.copytree(INPUTS, self.inputs)

    def test_checkout_without_private_directories(self):
        checkout = Path(self.temporary.name) / 'checkout'
        (checkout / 'art').mkdir(parents=True)
        shutil.copyfile(ROOT / 'art/bodyforge-athlete-realistic.blend',
                        checkout / 'art/bodyforge-athlete-realistic.blend')
        self.assertFalse((checkout / '.iskra').exists())
        receipt = verify_groom_inputs(checkout, self.inputs)
        self.assertEqual(len(receipt['inputs']), 5)
        self.assertEqual(receipt['license'], 'CC0-1.0')

    def test_missing_input_fails_before_blender_import(self):
        (self.inputs / 'short02_normal.png').unlink()
        result = subprocess.run([sys.executable, '-B', str(ROOT / 'scripts/groom-athlete.py'),
                                 '--verify-inputs', '--source-dir', str(self.inputs)],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn('short02_normal.png: missing or unreadable pinned input', result.stderr)
        self.assertIn('no outputs written', result.stderr)
        self.assertNotIn('bpy', result.stderr)

    def test_modified_bytes_are_rejected(self):
        with (self.inputs / 'short04.obj').open('ab') as stream:
            stream.write(b'\n# modified\n')
        with self.assertRaisesRegex(ValueError, 'short04.obj: SHA256 mismatch'):
            verify_groom_inputs(ROOT, self.inputs)

    def test_modified_source_blend_is_rejected(self):
        checkout = Path(self.temporary.name) / 'checkout'
        (checkout / 'art').mkdir(parents=True)
        (checkout / 'art/bodyforge-athlete-realistic.blend').write_bytes(b'modified source')
        with self.assertRaisesRegex(ValueError, 'bodyforge-athlete-realistic.blend: source SHA256 mismatch'):
            verify_groom_inputs(checkout, self.inputs)

    def test_manifest_cannot_repin_or_escape_the_source_directory(self):
        manifest_path = self.inputs / 'manifest.json'
        manifest = json.loads(manifest_path.read_text(encoding='utf8'))
        manifest['files'][0]['sha256'] = '0' * 64
        manifest_path.write_text(json.dumps(manifest), encoding='utf8')
        with self.assertRaisesRegex(ValueError, 'manifest hash/byte count differs'):
            verify_groom_inputs(ROOT, self.inputs)
        manifest['files'][0]['path'] = '../short02.obj'
        manifest_path.write_text(json.dumps(manifest), encoding='utf8')
        with self.assertRaisesRegex(ValueError, 'unknown or unsafe manifest input path'):
            verify_groom_inputs(ROOT, self.inputs)


if __name__ == '__main__':
    unittest.main()
