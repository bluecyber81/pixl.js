"""Exercise the public PC converter and validate its result with the firmware parser."""
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest

from PIL import Image


FW = Path(__file__).resolve().parents[2]
CONVERTER = FW / "scripts/video_clip_gen.py"


class ClipTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tools = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.tools.cleanup)
        folder = Path(cls.tools.name)
        parser = folder / "parse.c"
        parser.write_text('''#include "player_format.h"
#include <stdio.h>
int main(int argc, char **argv) {
    if (argc != 2) return 2;
    FILE *fp = fopen(argv[1], "rb");
    if (!fp) return 2;
    uint8_t raw[PLAYER_HEADER_BYTES];
    size_t n = fread(raw, 1, sizeof(raw), fp);
    if (fseek(fp, 0, SEEK_END)) return 2;
    long bytes = ftell(fp);
    fclose(fp);
    v_header_t header;
    size_t frame_size;
    return bytes >= 0 && player_parse_header(raw, n, (size_t)bytes, 128, 64, &header, &frame_size) ? 0 : 1;
}
''', encoding="ascii")
        cls.parser = folder / "parse.exe"
        subprocess.run(["gcc", "-std=c11", "-I", FW / "application/src/app/player/view",
                        parser, "-o", cls.parser], check=True)

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.frames = self.root / "frames"
        self.frames.mkdir()
        self.output = self.root / "clip.bin"

    def run_cli(self, fps, output=None):
        return subprocess.run([sys.executable, CONVERTER, str(fps), self.frames, output or self.output],
                              capture_output=True, text=True, encoding="utf-8", errors="replace")

    def assert_rejected(self, fps, output=None):
        output = output or self.output
        original = output.read_bytes()
        siblings = set(output.parent.iterdir())
        result = self.run_cli(fps, output)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Cannot create clip", result.stderr)
        self.assertEqual(output.read_bytes(), original)
        self.assertEqual(set(output.parent.iterdir()), siblings)

    def test_sorted_frames_polarity_and_row_padding(self):
        Image.new("1", (9, 2)).save(self.frames / "02.bmp")
        image = Image.new("1", (9, 2), 1)
        for point in ((0, 0), (8, 0), (1, 1)):
            image.putpixel(point, 0)
        image.save(self.frames / "01.png")
        for fps in (1, 60):
            result = self.run_cli(fps)
            self.assertEqual(result.returncode, 0, result.stderr)
            expected = struct.pack("<IHHHHI", 0x50495856, 2, fps, 9, 2, 0)
            self.assertEqual(self.output.read_bytes(), expected + bytes.fromhex("01010200 ff01ff01"))
            subprocess.run([self.parser, self.output], check=True)

    def test_rejects_empty_dir_invalid_rates_mixed_sizes_and_unreadable_frame(self):
        self.output.write_bytes(b"previous animation")
        self.assert_rejected(10)
        Image.new("1", (128, 64)).save(self.frames / "01.png")
        for fps in (0, 61):
            self.assert_rejected(fps)
        last = self.frames / "02.png"
        Image.new("1", (64, 32)).save(last)
        self.assert_rejected(10)
        last.write_bytes(b"incomplete")
        self.assert_rejected(10)

    def test_rejects_oversize_and_preserves_input(self):
        self.output.write_bytes(b"previous animation")
        image = self.frames / "01.png"
        for size in ((129, 64), (128, 65)):
            Image.new("1", size).save(image)
            self.assert_rejected(10)
        Image.new("1", (128, 64)).save(image)
        self.assert_rejected(10, image)

    def test_repeat_export_inside_input_dir(self):
        Image.new("1", (128, 64)).save(self.frames / "01.png")
        output = self.frames / "result.bin"
        first = self.run_cli(10, output)
        self.assertEqual(first.returncode, 0, first.stderr)
        original = output.read_bytes()
        second = self.run_cli(10, output)
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(output.read_bytes(), original)
        subprocess.run([self.parser, output], check=True)


if __name__ == "__main__":
    unittest.main()
