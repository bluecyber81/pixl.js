"""Build preflight only: actual engine identity, temporary fixtures, no SDK/build."""
import contextlib
import hashlib
import io
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import build_lcd


ROOT = Path(__file__).resolve().parents[1]
CORE = Path("fw/application/src/mod/vfs")
LITTLEFS = Path("fw/components/littlefs")
HEADER = CORE / "vfs_packed_identity.h"
ENGINE_FILES = [CORE / name for name in ("packed_fs.c", "packed_fs.h")]
ENGINE_FILES += [LITTLEFS / name for name in ("lfs.c", "lfs.h", "lfs_util.c", "lfs_util.h")]


class BuildPreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="lcd-build-preflight-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for relative in (*ENGINE_FILES, HEADER):
            destination = self.root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / relative, destination)
        self.header = self.root / HEADER
        self.original = self.header.read_text(encoding="utf-8")
        _, self.expected = build_lcd.packed_identity(self.root / CORE, self.root / LITTLEFS)

    def reject_unchanged(self, text, message):
        self.header.write_text(text, encoding="utf-8")
        before = {p: p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        with self.assertRaisesRegex(ValueError, message):
            build_lcd.check_packed_identity(self.root)
        self.assertEqual(before, {p: p.read_bytes() for p in self.root.rglob("*") if p.is_file()})

    def test_current_checkout_and_temp_copy_pass_without_changes(self):
        before = {path: (ROOT / path).read_bytes() for path in (*ENGINE_FILES, HEADER)}
        current = build_lcd.check_packed_identity(ROOT)
        copied = build_lcd.check_packed_identity(self.root)
        self.assertEqual(current, copied)
        self.assertEqual(current["engine_sha256"], self.expected)
        self.assertEqual(current["header_sha256"], hashlib.sha256(self.header.read_bytes()).hexdigest())
        self.assertTrue(current["both_header_representations_verified"])
        self.assertEqual(before, {path: (ROOT / path).read_bytes() for path in before})

    def test_stale_text_hash_is_rejected_even_with_correct_bytes(self):
        self.reject_unchanged(self.original.replace('"' + self.expected + '"', '"' + '0' * 64 + '"'),
                              "PIXL_PACKED_ENGINE_SHA256 missing")

    def test_stale_byte_hash_is_rejected_even_with_correct_text(self):
        first = "0x" + self.expected[:2]
        changed = "0x" + ("ff" if self.expected[:2] != "ff" else "00")
        self.reject_unchanged(self.original.replace(first, changed, 1), "PIXL_PACKED_ENGINE_SHA256_BYTES")

    def test_changed_engine_rejects_both_formerly_correct_representations(self):
        source = self.root / CORE / "packed_fs.c"
        source.write_bytes(source.read_bytes() + b"\n/* deliberately changed temporary fixture */\n")
        self.reject_unchanged(self.original, "PIXL_PACKED_ENGINE_SHA256, PIXL_PACKED_ENGINE_SHA256_BYTES")

    def test_missing_duplicate_and_malformed_representations_are_rejected(self):
        lines = self.original.splitlines(keepends=True)
        for name in ("PIXL_PACKED_ENGINE_SHA256", "PIXL_PACKED_ENGINE_SHA256_BYTES"):
            definition = next(line for line in lines if line.startswith("#define " + name + " "))
            for variant, text in (("missing", self.original.replace(definition, "")),
                                  ("duplicated", self.original + definition),
                                  ("malformed", self.original.replace(definition, "#define " + name + " broken\n"))):
                with self.subTest(name=name, variant=variant):
                    self.reject_unchanged(text, name)
        self.reject_unchanged(self.original.replace("0x" + self.expected[:2] + ", ", "", 1),
                              "PIXL_PACKED_ENGINE_SHA256_BYTES")

    def test_layout_contract_still_rejects_changed_geometry(self):
        header = self.root / CORE / "packed_fs.h"
        content = header.read_text(encoding="utf-8")
        self.assertIn("#define PFS_BLOCK_SIZE 4096u", content)
        header.write_text(content.replace("#define PFS_BLOCK_SIZE 4096u", "#define PFS_BLOCK_SIZE 2048u"), encoding="utf-8")
        self.reject_unchanged(self.original, "PackedFS layout identity preflight failed")

    def test_main_stops_both_backends_before_output_archive_sdk_or_process(self):
        self.header.write_text(self.original.replace('"' + self.expected + '"', '"' + '0' * 64 + '"'), encoding="utf-8")
        (self.root / "RELEASE_INFO.json").write_text("{}\n", encoding="utf-8")
        (self.root / "fw/application/src/version.inc.h").write_text('#define VERSION "2.22.0-DE3.97"\n', encoding="utf-8")
        output = self.root / "never-created-build"
        for backend in ("native", "docker"):
            with self.subTest(backend=backend), contextlib.ExitStack() as stack:
                stack.enter_context(patch.object(build_lcd, "__file__", str(self.root / "tools/build_lcd.py")))
                blocked = [stack.enter_context(patch.object(build_lcd, name)) for name in ("native_build", "make_archive")]
                blocked += [stack.enter_context(patch.object(build_lcd.subprocess, name)) for name in ("run", "check_output")]
                blocked += [stack.enter_context(patch.object(build_lcd.shutil, name)) for name in ("which", "copyfile")]
                blocked.append(stack.enter_context(patch.object(build_lcd.tempfile, "TemporaryDirectory")))
                errors = stack.enter_context(contextlib.redirect_stderr(io.StringIO()))
                result = build_lcd.main(["--mode", "development", "--version", "2.22.0-DE3.97",
                                         "--counter", "670", "--backend", backend, "--output", str(output)])
                self.assertEqual(result, 1)
                self.assertIn("PackedFS engine identity preflight failed", errors.getvalue())
                self.assertFalse(output.exists())
                for action in blocked:
                    action.assert_not_called()


if __name__ == "__main__":
    unittest.main()
