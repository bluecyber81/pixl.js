"""Exercise the real generator in disposable projects; HTTP is always mocked."""
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path
import csv
import io
import json
import os
import runpy
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

FW = Path(__file__).resolve().parents[2]
SCRIPT = FW / "scripts/amiibo_db_gen.py"
EXISTING = "0100000000040002"
ADDED = "abcdef0123456789"


def record(identifier=ADDED, name='New "figure" \\ test\nnext line'):
    return {"head": identifier[:8], "tail": identifier[8:],
            "name": name, "gameSeries": "Test series"}


class DatabaseRefreshTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.project = self.root / "fw"
        self.script = self.project / "scripts/amiibo_db_gen.py"
        self.script.parent.mkdir(parents=True)
        self.script.write_bytes(SCRIPT.read_bytes())
        (self.project / "data").mkdir()
        self.generated = self.project / "application/src/amiidb"
        self.generated.mkdir(parents=True)
        self.write_csv("amiidb_amiibo.csv", [[EXISTING, "Local name", "本地名称"]])
        self.write_csv("amiidb_game.csv", [["1", "0", "Game", "游戏", "1"],
                                            ["255", "0", "Other", "其他", "2"]])
        self.write_csv("amiidb_link.csv", [["1", EXISTING, "", "", ""]])
        for filename in ("db_amiibo.c", "db_game.c", "db_link.c", "db_note_index.h"):
            (self.generated / filename).write_bytes(b"preserved previous generated file\n")

    def write_csv(self, filename, rows):
        with (self.project / "data" / filename).open("w", newline="", encoding="utf8") as stream:
            csv.writer(stream).writerows(rows)

    def snapshot(self):
        return {str(path.relative_to(self.project)): (path.read_bytes(), path.stat().st_mtime_ns)
                for path in self.project.rglob("*") if path.is_file()}

    def execute(self, arguments=(), body=None, error=None):
        if body is None:
            body = {"amiibo": [record()]}
        raw = body if isinstance(body, bytes) else json.dumps(body).encode("utf8")
        response = io.BytesIO(raw)
        stdout, stderr = io.StringIO(), io.StringIO()
        original_cwd = Path.cwd()
        try:
            # Working directory is deliberately not the generator/project directory.
            os.chdir(self.root)
            with patch("urllib.request.urlopen", return_value=response, side_effect=error) as request, \
                    patch.object(sys, "argv", [str(self.script), *arguments]), \
                    redirect_stdout(stdout), redirect_stderr(stderr):
                try:
                    runpy.run_path(str(self.script), run_name="__main__")
                    status = 0
                except SystemExit as exit_error:
                    status = exit_error.code
        finally:
            os.chdir(original_cwd)
        return status, request, stdout.getvalue(), stderr.getvalue(), response.closed

    def assert_refresh_rejected(self, body=None, error=None):
        before = self.snapshot()
        status, request, _, stderr, closed = self.execute(["--refresh"], body, error)
        self.assertEqual(status, 1)
        self.assertIn("refresh failed; local files were not changed", stderr)
        self.assertEqual(before, self.snapshot())
        request.assert_called_once_with("https://amiiboapi.org/api/amiibo/", timeout=30)
        if error is None:
            self.assertTrue(closed)

    def test_default_and_explicit_offline_are_deterministic_without_network(self):
        csv_before = {p.name: p.read_bytes() for p in (self.project / "data").glob("*.csv")}
        for arguments in ([], ["--offline"]):
            status, request, _, _, _ = self.execute(arguments, error=AssertionError("Network in offline mode"))
            self.assertEqual(status, 0)
            request.assert_not_called()
            generated = {p.name: p.read_bytes() for p in self.generated.glob("*.c")}
            if arguments:
                self.assertEqual(first_generated, generated)
            else:
                first_generated = generated
        self.assertEqual(csv_before, {p.name: p.read_bytes() for p in (self.project / "data").glob("*.csv")})
        self.assertIn(b'{0x01000000, 0x00040002, "Local name", ', generated["db_amiibo.c"])

    def test_success_preserves_local_names_adds_once_and_uses_translation_fallback(self):
        body = {"amiibo": [record(EXISTING, "API must not replace local alias"), record(ADDED.upper())]}
        status, request, _, stderr, closed = self.execute(["--refresh"], body)
        self.assertEqual((status, stderr, closed), (0, "", True))
        request.assert_called_once_with("https://amiiboapi.org/api/amiibo/", timeout=30)
        with (self.project / "data/amiidb_amiibo.csv").open(encoding="utf8", newline="") as stream:
            rows = list(csv.reader(stream))
        self.assertEqual(rows, [[EXISTING, "Local name", "本地名称"], [ADDED, record()["name"], ""]])
        generated = (self.generated / "db_amiibo.c").read_text(encoding="utf8")
        self.assertIn('{0xabcdef01, 0x23456789, "New \\"figure\\" \\\\ test\\nnext line", ""}', generated)
        self.assertNotIn('"None"', generated)
        links = (self.generated / "db_link.c").read_text(encoding="utf8")
        self.assertIn('{"", DB_NOTE_CN(""), DB_NOTE_IT("")}', links)
        self.assertIn('{1, 255, 0}', links)
        first = {p.name: p.read_bytes() for p in self.generated.glob("*.c")}
        self.assertEqual(self.execute(["--refresh"], body)[0], 0)
        self.assertEqual(first, {p.name: p.read_bytes() for p in self.generated.glob("*.c")})
        with (self.project / "data/amiidb_amiibo.csv").open(encoding="utf8", newline="") as stream:
            self.assertEqual(len(list(csv.reader(stream))), 2)

    def test_http_timeout_and_transport_failures_preserve_all_files(self):
        for error in (HTTPError("https://amiiboapi.org/api/amiibo/", 404, "missing", None, None),
                      URLError("network unavailable"), TimeoutError("timed out")):
            with self.subTest(error=type(error).__name__):
                self.assert_refresh_rejected(error=error)

    def test_invalid_json_preserves_all_files(self):
        self.assert_refresh_rejected(b"<html>error</html>")

    def test_invalid_response_shapes_preserve_all_files(self):
        for body in ([], {}, {"amiibo": None}, {"amiibo": {}}, {"amiibo": []},
                     {"amiibo": [None]}, {"amiibo": ["invalid"]}):
            with self.subTest(body=body):
                self.assert_refresh_rejected(body)

    def test_invalid_ids_and_duplicate_ids_preserve_all_files(self):
        for field in ("head", "tail"):
            for value in (None, 12345678, "", "1234567", "123456789", "1234567g", "1234567\n"):
                bad = record()
                bad[field] = value
                with self.subTest(field=field, value=value):
                    self.assert_refresh_rejected({"amiibo": [record(EXISTING), bad]})
        for records in ([record("0000000000000000")], [record(), record(ADDED.upper())]):
            with self.subTest(records=records):
                self.assert_refresh_rejected({"amiibo": records})

    def test_missing_invalid_and_unencodable_names_preserve_all_files(self):
        for field in ("name", "gameSeries"):
            for value in (None, [], 7, "", " \t", "bad\0text", "bad\ud800text"):
                bad = record()
                bad[field] = value
                with self.subTest(field=field, value=repr(value)):
                    self.assert_refresh_rejected({"amiibo": [record(EXISTING), bad]})
            bad = record()
            del bad[field]
            self.assert_refresh_rejected({"amiibo": [bad]})

    def test_generated_escaped_metadata_compiles_and_roundtrips(self):
        # New API names and existing local game/link translations use the same escaping.
        text = 'Quote " slash \\ newline\n tab\t ctrl\x017 中文'
        self.write_csv("amiidb_game.csv", [["1", "0", text, text, "1"],
                                            ["255", "0", "Other", "其他", "2"]])
        self.write_csv("amiidb_link.csv", [["1", EXISTING, text, text, text]])
        self.assertEqual(self.execute(["--refresh"], {"amiibo": [record(name=text)]})[0], 0)
        shutil.copyfile(FW / "application/src/amiidb/db_header.h", self.generated / "db_header.h")
        main = self.generated / "test_main.c"
        # Octal escapes encode the expected UTF-8 bytes independently of the generator.
        expected = "".join("\\%03o" % byte for byte in text.encode("utf8"))
        main.write_text('#include "db_header.h"\n#include <string.h>\n'
                        'int main(void) { const char *expected = "' + expected + '";\n'
                        'return strcmp(amiibo_list[1].name_en, expected) || '
                        'strcmp(game_list[0].name_en, expected) || '
                        'strcmp(game_list[0].name_cn, expected) || '
                        'strcmp(db_usage_notes[link_list[0].note_index].en, expected) || '
                        'strcmp(db_usage_notes[link_list[0].note_index].cn, expected) || '
                        'strcmp(db_usage_notes[link_list[0].note_index].it, expected); }\n', encoding="utf8")
        compiler = shutil.which("gcc")
        self.assertIsNotNone(compiler, "Existing host C compiler is required")
        executable = self.generated / ("test.exe" if os.name == "nt" else "test")
        compile_result = subprocess.run([compiler, "-std=c11", "-Wall", "-Wextra",
                                         "-Wno-missing-field-initializers", "-Werror",
                                         *map(str, self.generated.glob("*.c")), "-o", str(executable)],
                                        capture_output=True, text=True, timeout=30)
        self.assertEqual(compile_result.returncode, 0, compile_result.stdout + compile_result.stderr)
        self.assertEqual(subprocess.run([str(executable)], timeout=10).returncode, 0)

    def test_invalid_game_graph_and_fields_preserve_all_outputs_and_csv(self):
        valid = [["1", "0", "Game", "", "1"], ["255", "0", "Other", "", "2"]]
        invalid = [
            [["1", "1", "Self cycle", "", "1"], valid[1]],
            [["1", "2", "Cycle A", "", "1"], ["2", "1", "Cycle B", "", "2"], valid[1]],
            [["1", "2", "Missing parent", "", "1"], valid[1]],
            [valid[0], ["01", "0", "Duplicate numeric ID", "", "1"], valid[1]],
            [["0", "0", "Reserved sentinel", "", "1"], valid[1]],
            [["256", "0", "Overflow ID", "", "1"], valid[1]],
            [["1", "-1", "Invalid parent", "", "1"], valid[1]],
            [["1", "0", "Overflow order", "", "256"], valid[1]],
            [["1", "0", "Invalid order", "", "-1"], valid[1]],
            [["1", "0", "Non ASCII order", "", "\u0661"], valid[1]],
            [valid[1]],  # Link references missing game 1.
            [valid[0]],  # Refresh adds an uncategorized figure; game 255 is missing.
        ]
        for rows in invalid:
            for mode in (["--offline"], ["--refresh"]):
                if rows == [valid[0]] and mode == ["--offline"]:
                    continue
                with self.subTest(rows=rows, mode=mode):
                    self.write_csv("amiidb_game.csv", rows)
                    before = self.snapshot()
                    with self.assertRaises(ValueError):
                        self.execute(mode)
                    self.assertEqual(before, self.snapshot())

    def test_case_equivalent_ids_keep_local_names_and_do_not_add_other_link(self):
        self.write_csv("amiidb_amiibo.csv", [[ADDED.upper(), "Local alias", "Local translation"]])
        self.write_csv("amiidb_link.csv", [["1", ADDED, "Note", "", ""]])
        for mode in (["--offline"], ["--refresh"]):
            with self.subTest(mode=mode):
                self.assertEqual(self.execute(mode, {"amiibo": [record(ADDED)]})[0], 0)
                data = (self.generated / "db_amiibo.c").read_text(encoding="utf8")
                links = (self.generated / "db_link.c").read_text(encoding="utf8")
                self.assertIn('"Local alias", "Local translation"', data)
                self.assertIn('{"Note", DB_NOTE_CN(""), DB_NOTE_IT("")}', links)
                self.assertIn('{0, 1, 0}', links)
                self.assertNotIn(", 255,", links)
                with (self.project / "data/amiidb_amiibo.csv").open(encoding="utf8", newline="") as stream:
                    self.assertEqual(len(list(csv.reader(stream))), 1)

    def test_each_publication_failure_restores_original_files_and_refresh_csv(self):
        real_replace = os.replace
        for failure_index in range(1, 6):
            before = self.snapshot()
            calls = []
            def replace(source, destination):
                calls.append(str(destination))
                if len(calls) == failure_index:
                    raise OSError("injected publication failure")
                return real_replace(source, destination)
            with self.subTest(failure_index=failure_index), patch("os.replace", side_effect=replace):
                with self.assertRaisesRegex(OSError, "injected publication failure"):
                    self.execute(["--refresh"])
            self.assertEqual(before, self.snapshot())

    def test_staging_failure_never_publishes_any_output(self):
        real_copy = shutil.copy2
        for failure_index in range(1, 6):
            before = self.snapshot()
            calls = []
            def copy(source, destination):
                calls.append(str(destination))
                if len(calls) == failure_index:
                    raise OSError("injected backup staging failure")
                return real_copy(source, destination)
            with self.subTest(failure_index=failure_index), patch("shutil.copy2", side_effect=copy):
                with self.assertRaisesRegex(OSError, "backup staging failure"):
                    self.execute(["--refresh"])
            self.assertEqual(before, self.snapshot())

    def test_publication_rollback_removes_new_targets(self):
        # The first output did not previously exist: rollback must remove it.
        (self.generated / "db_amiibo.c").unlink()
        before = self.snapshot()
        real_replace = os.replace
        calls = []
        def replace(source, destination):
            calls.append(str(destination))
            if len(calls) == 2:
                raise OSError("injected second publication failure")
            return real_replace(source, destination)
        with patch("os.replace", side_effect=replace):
            with self.assertRaisesRegex(OSError, "second publication failure"):
                self.execute(["--refresh"])
        self.assertEqual(before, self.snapshot())

    def test_failed_rollback_reports_and_retains_recovery_backup(self):
        original = (self.generated / "db_amiibo.c").read_bytes()
        real_replace = os.replace
        calls = []
        def replace(source, destination):
            calls.append(str(destination))
            if len(calls) in (2, 3):
                raise OSError("injected publish and rollback failure")
            return real_replace(source, destination)
        with patch("os.replace", side_effect=replace):
            with self.assertRaisesRegex(OSError, "restore retained backups") as raised:
                self.execute(["--refresh"])
        retained = list(self.generated.glob(".amiidb-old-*.tmp"))
        self.assertEqual(len(retained), 1)
        self.assertEqual(retained[0].read_bytes(), original)
        self.assertIn(str(retained[0]), str(raised.exception))
        self.assertFalse(list(self.generated.glob(".amiidb-new-*.tmp")))


if __name__ == "__main__":
    unittest.main()
