"""Pin the two reviewed My Mario metadata additions and exercise offline codegen.

IDs and historical category links were cross-checked against:
https://github.com/Odessakun/pixl.js/commit/b3aa858a38e51ac7cc4a614cc3c0defefdc309d5
https://github.com/8bitDream/AmiiboAPI/commit/c4a90748edf2277cc987bd901eef5d677f3422c4
Category 26 follows the existing wooden-block records; it is not a hardware or
gameplay compatibility claim. No tag payloads, keys or devices are used here.
"""
from contextlib import redirect_stdout
from hashlib import sha256
from pathlib import Path
import csv
import io
import runpy
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

FW = Path(__file__).resolve().parents[2]
ADDITIONS = [
    ["0000000404431c02", "Mario (Melody Car) - My Mario Wooden Blocks", ""],
    ["000a000404451c02", "Toad - My Mario Wooden Blocks", ""],
]
BASELINE = {
    "amiidb_amiibo.csv": (950, "c37e5fef28dc2cd4fb88f59b67faf412c7b5c7846dfcb57e348c270b3362874f"),
    "amiidb_link.csv": (1342, "0204db57437526875f43b9f89d2107714a5903aac9f33cd77fd13e2f0fb1f815"),
}


class CatalogDE39Tests(unittest.TestCase):
    def test_only_two_reviewed_entries_and_links_are_added(self):
        rows = {}
        for filename, (old_count, old_hash) in BASELINE.items():
            content = (FW / "data" / filename).read_bytes()
            lines = content.splitlines(keepends=True)
            self.assertEqual(len(lines), old_count + 2)
            # Preserve the reviewed historical prefix byte-for-byte after
            # reversing only the later reviewed name and note corrections.
            prefix = b"".join(lines[:old_count])
            if filename == "amiidb_amiibo.csv":
                for aid, old, new in [
                    ("018b000002460502", "Cyrrus", "Cyrus"),
                    ("04d0000101960502", "[AC] 339 - Fritta", "[AC] 339 - Frita"),
                    ("033f0001008f0502", "[AC] 076 - Jeramiah", "[AC] 076 - Jeremiah"),
                    ('0a02000103b30502', '412 - C.J. ', '412 - C.J.'),
                    ('0a0c000103c30502', '428 - Audie ', '428 - Audie'),
                    ('0a0e000103c50502', '430 - Judy ', '430 - Judy'),
                ]:
                    corrected = f"{aid},{new},{new}".encode()
                    self.assertEqual(prefix.count(corrected), 1)
                    prefix = prefix.replace(corrected, f"{aid},{old},{old}".encode())
            else:
                # Preserve the DE3.9 digest after reversing only the four later
                # reward descriptions. The game/figure key on each line is fixed.
                old_rows = (Path(__file__).parent / "fixtures" / "zelda_champion_notes_before_correction.csv").read_bytes().splitlines(keepends=True)
                self.assertEqual(len(old_rows), 4)
                for line_number, old_row in zip((17, 23, 54, 60), old_rows):
                    current = lines[line_number - 1]
                    self.assertEqual(current.split(b",", 2)[:2], old_row.split(b",", 2)[:2])
                    self.assertNotEqual(current, old_row)
                    lines[line_number - 1] = old_row
                prefix = b"".join(lines[:old_count])
            self.assertEqual(sha256(prefix).hexdigest(), old_hash)
            rows[filename] = list(csv.reader(io.StringIO(content.decode("utf8"))))
        amiibos = rows["amiidb_amiibo.csv"]
        links = rows["amiidb_link.csv"]
        self.assertEqual(amiibos[-2:], ADDITIONS)
        self.assertEqual(len({row[0] for row in amiibos}), 952)
        self.assertEqual(links[-2:], [["26", row[0], "", "", ""] for row in ADDITIONS])
        self.assertEqual(sum(row[0] == "26" for row in links), 37)
        games = (FW / "data/amiidb_game.csv").read_bytes()
        corrected = b"49,0,Yu-Gi-Oh! Rush Duel Saikyo Battle Royale,"
        self.assertEqual(games.count(corrected), 1)
        reference_games = games.replace(corrected, b"49,0,Yu-Gi-Oh! Rush Duel Saikyo Battle Royale ,")
        self.assertEqual(sha256(reference_games).hexdigest(),
                         "659d2b0703b0e059f9489dfaeab4341f3cc58d5eba19756664e2f39c58ceff47")

    def test_generated_metadata_compiles_and_all_links_resolve(self):
        compiler = shutil.which("gcc")
        self.assertIsNotNone(compiler, "Existing host gcc is required")
        with tempfile.TemporaryDirectory(prefix="pixl-de39-catalog-") as temporary:
            project = Path(temporary)
            script = project / "scripts/amiibo_db_gen.py"
            script.parent.mkdir()
            shutil.copyfile(FW / "scripts/amiibo_db_gen.py", script)
            (project / "data").mkdir()
            for filename in (*BASELINE, "amiidb_game.csv"):
                shutil.copyfile(FW / "data" / filename, project / "data" / filename)
            generated = project / "application/src/amiidb"
            generated.mkdir(parents=True)
            previous = None
            for _ in range(2):
                stdout = io.StringIO()
                with patch("urllib.request.urlopen", side_effect=AssertionError("offline network access")) as request, \
                        patch.object(sys, "argv", [str(script), "--offline"]), redirect_stdout(stdout):
                    runpy.run_path(str(script), run_name="__main__")
                request.assert_not_called()
                self.assertIn("Found 952 amiibo records.", stdout.getvalue())
                self.assertNotIn("uncategorized", stdout.getvalue())
                current = {path.name: path.read_bytes() for path in generated.glob("*.c")}
                if previous is not None:
                    self.assertEqual(current, previous, "Offline code generation must be deterministic")
                previous = current
            for filename in ("db_header.h", "db_search.c"):
                shutil.copyfile(FW / "application/src/amiidb" / filename, generated / filename)
            (generated / "settings.h").write_text(
                "static int isChineseLanguage(void) { return 1; }\n", encoding="utf8")
            main = generated / "test_catalog.c"
            main.write_text(r'''
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "db_header.h"
static unsigned count_links(uint8_t id) {
    unsigned count = 0;
    for (const db_link_t *link = link_list; link->game_id; ++link)
        if (link->game_id == id) ++count;
    for (const db_game_t *game = game_list; game->game_id; ++game)
        if (game->parent_game_id == id) count += count_links(game->game_id);
    return count;
}
int main(void) {
    assert(amiibo_list_size == 952);
    for (size_t i = 0; i < amiibo_list_size; ++i) {
        const db_amiibo_t *amiibo = &amiibo_list[i];
        assert(get_amiibo_by_id(amiibo->head, amiibo->tail) == amiibo);
        if (i) {
            uint64_t before = ((uint64_t)amiibo_list[i - 1].head << 32) | amiibo_list[i - 1].tail;
            uint64_t current = ((uint64_t)amiibo->head << 32) | amiibo->tail;
            assert(before < current);
        }
    }
    unsigned links = 0;
    for (const db_link_t *link = link_list; link->game_id; ++link) {
        assert(link->amiibo_index < amiibo_list_size);
        const db_amiibo_t *linked = &amiibo_list[link->amiibo_index];
        assert(get_amiibo_by_id(linked->head, linked->tail) == linked);
        unsigned matching_games = 0;
        for (const db_game_t *game = game_list; game->game_id; ++game)
            matching_games += game->game_id == link->game_id;
        assert(matching_games == 1);
        ++links;
    }
    assert(links == 1344 && count_links(26) == 37);
    for (const db_game_t *game = game_list; game->game_id; ++game)
        assert(game->link_cnt == count_links(game->game_id));
    const db_amiibo_t *mario = get_amiibo_by_id(0x00000004, 0x04431c02);
    const db_amiibo_t *toad = get_amiibo_by_id(0x000a0004, 0x04451c02);
    assert(mario && toad);
    assert(strcmp(get_amiibo_display_name(mario), "Mario (Melody Car) - My Mario Wooden Blocks") == 0);
    assert(strcmp(get_amiibo_display_name(toad), "Toad - My Mario Wooden Blocks") == 0);
    assert(get_link_by_id(26, mario->head, mario->tail));
    assert(get_link_by_id(26, toad->head, toad->tail));
    assert(!is_valid_amiibo_v3(mario->head, mario->tail));
    assert(!is_valid_amiibo_v3(toad->head, toad->tail));
    puts("PASS: 952 unique sorted IDs, 1344 links, every category count and two My Mario lookups");
    return 0;
}
''', encoding="utf8")
            executable = generated / "test_catalog.exe"
            build = subprocess.run([compiler, "-std=c11", "-Wall", "-Wextra", "-Werror",
                                    "-Wno-unused-parameter", "-Wno-missing-field-initializers",
                                    *map(str, generated.glob("*.c")), "-o", str(executable)],
                                   capture_output=True, text=True)
            self.assertEqual(build.returncode, 0, build.stdout + build.stderr)
            result = subprocess.run([str(executable)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("PASS: 952 unique sorted IDs, 1344 links", result.stdout)


if __name__ == "__main__":
    unittest.main()
