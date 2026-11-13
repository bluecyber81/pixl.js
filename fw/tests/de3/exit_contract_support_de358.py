"""Compile actual exit-contract C with deterministic peripheral mocks.

Only #include directives are removed from complete local modules; function bodies
are kept intact. Headers for the launcher types are the current production
headers. No SDK/ARM/device execution is performed.
"""
import hashlib
import os
from pathlib import Path
import re
import subprocess
import tempfile
from input_context_support import context_state, context_functions

HERE = Path(__file__).resolve().parent
FW = HERE.parents[1]
SRC = FW / "application/src"


def without_includes(text):
    return re.sub(r"^\s*#\s*include[^\n]*", "", text, flags=re.M)


def actual(relative):
    return without_includes((SRC / relative).read_text(encoding="utf-8"))


def function(text, name):
    # These modules declare functions at column zero. Do not mistake an earlier
    # indented `if (name(...)) {` call site for the definition under test.
    match = re.search(r"^[A-Za-z_][^\n;{}]*\b" + re.escape(name) + r"\([^;{}]*?\)\s*\{", text, re.M)
    if not match:
        raise AssertionError("Production function not found: " + name)
    end = text.index("{", match.start()) + 1
    depth = 1
    while depth:
        depth += (text[end] == "{") - (text[end] == "}")
        end += 1
    return text[match.start():end]


def launcher_fixture():
    fixture = (HERE / "exit_contract_fixture_de358.c.in").read_text(encoding="utf-8")
    fixture = fixture.replace("/* ACTUAL_LAUNCHER_TYPES */",
                              actual("core/mini_app_defines.h") + "\n" +
                              actual("core/mini_app_launcher.h"))
    context = context_state() + context_functions(("mui_input_context_changed",))
    return fixture.replace("/* ACTUAL_LAUNCHER_MODULE */", context + actual("core/mini_app_launcher.c"))


def compile_cases(testcase, source, cases, label):
    """Run every case in a fresh process; assert semantic checks, not code text."""
    with tempfile.TemporaryDirectory(prefix="de358-" + label + "-") as temporary:
        folder = Path(temporary)
        cfile = folder / "contract.c"
        executable = folder / ("contract.exe" if os.name == "nt" else "contract")
        cfile.write_text(source, encoding="utf-8")
        command = [os.environ.get("CC", "gcc"), "-std=c11", "-O1", "-g",
                   "-Wall", "-Wextra", "-Werror", "-Wno-unused-function",
                   "-Wno-unused-parameter", "-fshort-enums"]
        if os.environ.get("UI_SANITIZE") == "1":
            command += ["-fsanitize=address,undefined", "-fno-sanitize-recover=all",
                        "-fno-omit-frame-pointer"]
            if os.name != "nt":
                command += ["-fno-pie", "-no-pie"]
        built = subprocess.run(command + [str(cfile), "-o", str(executable)],
                               capture_output=True, text=True, timeout=60)
        testcase.assertEqual(built.returncode, 0, built.stdout + built.stderr)
        for number, description in enumerate(cases):
            with testcase.subTest(case=number, description=description):
                ran = subprocess.run([str(executable), str(number)],
                                     capture_output=True, text=True, timeout=15)
                testcase.assertEqual(ran.returncode, 0, description + "\n" + ran.stdout + ran.stderr)
                testcase.assertIn("PASS", ran.stdout)
        print("PASS", label, len(cases), "actual-C behavior cases")

