"""Versioned App3 Resume: actual save/restore C with explicit host boundaries.

Uses the production snapshot declaration, Mlib checked string assignment,
history code and scene dispatcher. Catalog pages, favorites, slots and UI are
small controlled fixtures; this is not a device sleep/wake or NFC test.
"""
from pathlib import Path
import hashlib
import json
import os
import re
import subprocess
import tempfile
import unittest

from test_app_startup_allocations import function

HERE = Path(__file__).resolve().parent
FW = HERE.parents[1]
SRC = FW / "application/src"


class App3ResumeTests(unittest.TestCase):
    def test_actual_versioned_snapshot_navigation_and_failure_boundaries(self):
        paths = [SRC / "app/amiidb/app_amiidb.h", SRC / "app/amiidb/app_amiidb_resume.h",
                 SRC / "app/amiidb/api/amiidb_api_fav.h", SRC / "app/amiidb/api/amiidb_api_db.c",
                 SRC / "mui/mui_alloc.h", SRC / "mui/mui_scene_dispatcher.c",
                 SRC / "app/amiidb/scene/amiidb_scene_config.h"]
        header, resume, fav, history, alloc, dispatch, config = [p.read_text() for p in paths]
        cache = re.search(r"typedef struct \{[^}]*\} app_amiidb_cache_data_t;", header).group(0)
        constants = "\n".join(re.findall(r"^#define APP_AMIIDB_RESUME_.*", header, re.M))
        fav_types = fav[fav.index("typedef struct"):fav.index("typedef void")]
        scene_ids = re.findall(r"ADD_SCENE\(amiidb, [^,]+, ([^)]+)\)", config)
        enums = "enum {" + ",".join("AMIIDB_SCENE_" + x for x in scene_ids) + ",AMIIDB_SCENE_MAX};"
        actual_history = history[history.index("static const db_amiibo_t *recent_figures"):history.index("static unsigned char ascii_lower")]
        actual_resume = re.sub(r"^#include[^\n]*\n", "", resume, flags=re.M)
        code = (HERE / "amiidb_resume.c.in").read_text()
        replacements = {
            "/* ACTUAL_FAV_TYPES */": fav_types,
            "/* ACTUAL_SNAPSHOT */": constants + "\n" + cache,
            "/* ACTUAL_SCENE_IDS */": enums,
            "/* ACTUAL_CHECKED_STRING */": function(alloc, "mui_string_try_set_str"),
            "/* ACTUAL_HISTORY */": actual_history,
            "/* ACTUAL_DISPATCHER */": "\n".join(function(dispatch, n) for n in (
                "mui_scene_dispatcher_next_scene", "mui_scene_dispatcher_back_scene",
                "mui_scene_dispatcher_previous_scene", "mui_scene_dispatcher_current_scene")),
            "/* ACTUAL_RESUME */": actual_resume,
        }
        for mark, actual in replacements.items():
            self.assertIn(mark, code)
            code = code.replace(mark, actual)
        self.assertIn(".hibernate_enabled = true", (SRC / "app/amiidb/app_amiidb.c").read_text())
        with tempfile.TemporaryDirectory(prefix="amiidb-resume-") as temp:
            output = Path(os.environ.get("AMIIDB_RESUME_REPORT_DIR", temp))
            output.mkdir(parents=True, exist_ok=True)
            cfile, binary = output / "amiidb_resume.c", output / "amiidb_resume"
            cfile.write_text(code)
            command = ["gcc", "-std=c11", "-O1", "-g", "-Wall", "-Wextra", "-Werror",
                       "-Wno-unused-function", "-Wno-unused-parameter", "-I", str(FW / "components/mlib"),
                       str(cfile), "-o", str(binary)]
            if os.environ.get("UI_SANITIZE") == "1":
                command += ["-fsanitize=address,undefined", "-fno-sanitize-recover=all", "-fno-omit-frame-pointer", "-no-pie"]
            built = subprocess.run(command, capture_output=True, text=True, timeout=60)
            run = subprocess.run([str(binary)], capture_output=True, text=True, timeout=60) if not built.returncode else None
            report = {"passed": bool(run and not run.returncode), "command": command,
                      "source_sha256": {str(p.relative_to(FW)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
                      "build_exit": built.returncode, "build_stderr": built.stderr,
                      "run_exit": None if run is None else run.returncode,
                      "stdout": "" if run is None else run.stdout, "stderr": "" if run is None else run.stderr,
                      "device_access": False,
                      "limits": ["Synthetic native boundary tests; no App643 equivalence claim for this new feature.",
                                 "Actual snapshot/validation/history/scene-stack code; bounded catalog/UI/storage fixtures.",
                                 "Sleep from uncommitted text input resumes its stable list using the committed query.",
                                 "Missing/empty slots and missing catalog/favorite targets resume the parent list; no raw tags retained."]}
            (output / "RESULTS.json").write_text(json.dumps(report, indent=2) + "\n")
            self.assertEqual(built.returncode, 0, built.stdout + built.stderr)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            self.assertIn("PASS", run.stdout)
            print(run.stdout.strip())


if __name__ == "__main__":
    unittest.main()
