"""Source-only tests for the native test packager's web inventory."""

from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pack_web_apk import inventory


class InventoryTest(unittest.TestCase):
    def setUp(self):
        self.dist = Path(self.enterContext(TemporaryDirectory()))
        (self.dist / "index.html").write_bytes(b"<!doctype html>")
        (self.dist / "index.js").write_bytes(b"export {};")
        (self.dist / "assets").mkdir()

    def test_preserves_radiance_texture_bytes(self):
        data = b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 1\n\x80\x80\x80\x81"
        (self.dist / "assets" / "athlete-studio.hdr").write_bytes(data)

        key = "assets/web/assets/athlete-studio.hdr"
        self.assertEqual(inventory(self.dist)[key], (key, data))

    def test_rejects_an_empty_texture(self):
        (self.dist / "assets" / "empty.hdr").touch()

        with self.assertRaisesRegex(ValueError, "unexpected or empty asset: assets/empty.hdr"):
            inventory(self.dist)

    def test_rejects_an_unlisted_extension(self):
        (self.dist / "assets" / "unexpected.bin").write_bytes(b"unlisted")

        with self.assertRaisesRegex(ValueError, "unexpected or empty asset: assets/unexpected.bin"):
            inventory(self.dist)


if __name__ == "__main__":
    unittest.main()
