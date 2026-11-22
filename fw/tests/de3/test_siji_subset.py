"""Actual u8g2 pixel/metric equivalence and source coverage of compact Siji."""
import hashlib
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

FW = Path(os.environ.get("PIXL_SIJI_FW", Path(__file__).resolve().parents[2]))
BASE = Path(os.environ.get("PIXL_SIJI_FULL_FONT", FW / "data/siji_t_6x10_full.c"))
SUBSET = Path(os.environ.get("PIXL_SIJI_SUBSET_FONT", FW / "application/src/mui/u8g2_font_siji_t_6x10.c"))
GENERATOR = Path(os.environ.get("PIXL_SIJI_GENERATOR", FW / "scripts/siji_subset_gen.py"))
spec = importlib.util.spec_from_file_location("siji_subset_gen", GENERATOR)
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)

# Exact compiled full font bytes at qualified App672 commit 96cc712f67b8d1376b1f86b30034da1209f82e0e.
FULL_FONT_SHA256 = "50b8a2e592373d06fdc1bce7a9720339bfc49f8695110693df1412840b229298"
LIBS = ["u8g2_setup.c", "u8g2_font.c", "u8g2_hvline.c", "u8g2_ll_hvline.c", "u8g2_box.c",
        "u8g2_intersection.c", "u8g2_line.c", "u8g2_kerning.c", "u8x8_8x8.c", "u8g2_buffer.c",
        "u8g2_bitmap.c", "u8g2_circle.c", "u8x8_setup.c", "u8x8_display.c", "u8x8_cad.c",
        "u8x8_byte.c", "u8x8_gpio.c", "u8x8_capture.c", "u8x8_u16toa.c", "u8x8_u8toa.c"]


class SijiSubsetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.full = generator.load_c_font(BASE)
        cls.current = generator.load_c_font(SUBSET)
        cls.references = generator.source_references(FW / "application/src")
        cls.required = sorted(generator.ASCII | set(cls.references))

    def test_regeneration_covers_all_source_icons_and_preserves_glyph_records(self):
        self.assertEqual(hashlib.sha256(self.full).hexdigest(), FULL_FONT_SHA256)
        self.assertEqual(len(self.full), 10529)
        expected = generator.subset_font(self.full, self.references)
        self.assertEqual(self.current, expected)
        self.assertEqual(SUBSET.read_text(encoding="utf8"), generator.render_c(expected))
        full_records, _ = generator.parse_font(self.full)
        records, _ = generator.parse_font(self.current)
        self.assertEqual(len(full_records), 726)
        self.assertEqual(set(records), set(self.required))
        self.assertEqual(self.current[1:23], self.full[1:23])
        for code in self.required:
            self.assertEqual(records[code], full_records[code], f"U+{code:04X}")
        self.assertTrue({0xe1b5, 0xe1ed, 0xe02b, 0xe1d6, 0xe069, 0xe12e, 0xe21f} <= records.keys())
        self.assertLess(len(self.current), len(self.full))

    def run_renderer(self, current):
        with tempfile.TemporaryDirectory(prefix="pixl-siji-render-") as temp:
            folder = Path(temp)
            (folder / "mui_u8g2.h").write_text('#include "u8g2.h"\n')
            (folder / "full.c").write_text(BASE.read_text().replace(generator.FONT_SYMBOL, "siji_full_reference"))
            (folder / "subset.c").write_text(generator.render_c(current))
            (folder / "siji_required.h").write_text(
                f"#define SIJI_SUBSET_BYTES {len(current)}\n"
                f"#define SIJI_REQUIRED_COUNT {len(self.required)}\n"
                "static const uint16_t siji_required[] = {" +
                ",".join(f"0x{code:04x}" for code in self.required) + "};\n")
            harness = Path(__file__).with_name("siji_subset_host.c")
            shutil.copyfile(harness, folder / "main.c")
            u8 = FW / "components/u8g2/csrc"
            binary = folder / "test.exe"
            command = ["gcc", "-std=c11", "-O1", "-g", "-I", str(folder), "-I", str(u8)]
            if os.environ.get("PIXL_SANITIZE") == "1":
                command += ["-fsanitize=address,undefined", "-fno-sanitize-recover=all"]
            command += [str(folder / name) for name in ("main.c", "full.c", "subset.c")]
            command += [str(u8 / name) for name in LIBS] + ["-o", str(binary)]
            built = subprocess.run(command, capture_output=True, text=True, timeout=120)
            self.assertEqual(built.returncode, 0, built.stdout + built.stderr)
            return subprocess.run([str(binary)], capture_output=True, text=True, timeout=60)

    def test_every_retained_glyph_has_identical_actual_pixels_and_metrics(self):
        result = self.run_renderer(self.current)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("65536 lookup checks", result.stdout)
        print(result.stdout.strip())

    def test_actual_renderer_gate_rejects_a_dropped_truncation_icon(self):
        incomplete = generator.subset_font(self.full, set(self.references) - {0xe21f})
        result = self.run_renderer(incomplete)
        self.assertEqual(result.returncode, 73, result.stdout + result.stderr)
        self.assertIn("u8g2_IsGlyph", result.stderr)

    def test_source_scan_covers_literal_forms_and_ignores_comments(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "example.c"
            path.write_text(r'''// 0xe276 is not used
#define RADIO 0xe1b5u
const unsigned setting = 57643;
const char *glyphs = "\xee\x84\xae\uE21F";
/* 0xe275 is not used either */
const char *literal = "\ue26d";
const unsigned large = 0xe0000000;
'''.replace(r'\ue26d', '\ue26d'))
            self.assertEqual(set(generator.source_references(temp)), {0xe1b5, 57643, 0xe12e, 0xe21f, 0xe26d})

    def test_unknown_required_glyph_fails_before_replacing_output(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            (folder / "example.c").write_text("#define NEW_ICON 0xe277\n")
            output = folder / "font.out"
            output.write_bytes(b"previous checked font")
            result = subprocess.run(["python3", "-B", str(GENERATOR), "--base", str(BASE),
                                     "--source-root", str(folder), "--output", str(output)],
                                    capture_output=True, text=True, timeout=30)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Missing source glyphs: U+E277", result.stderr)
            self.assertEqual(output.read_bytes(), b"previous checked font")


if __name__ == "__main__":
    unittest.main()
