"""Compile actual cache/NFC functions with host-only hardware stubs.

Run: python3 fw/tests/de2/test_cache_nfc.py --cc gcc --sanitize
Requires an existing C compiler, no Python packages, BLE or target hardware.
The temporary C units insert functions directly from the current firmware;
templates contain assertions and stubs only, not copied implementations.
"""
from pathlib import Path
import argparse
import os
import shlex
import subprocess
import tempfile


def function(source, signature):
    start = source.index(signature)
    opening = source.index("{", start)
    depth = 1
    for index in range(opening + 1, len(source)):
        depth += (source[index] == "{") - (source[index] == "}")
        if not depth:
            return source[start:index + 1]
    raise ValueError("Unterminated function: " + signature)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cc", default=os.environ.get("CC", "gcc"))
    parser.add_argument("--sanitize", action="store_true")
    args = parser.parse_args()
    tests = Path(__file__).resolve().parent
    source_root = tests.parents[1] / "application/src"
    cache = (source_root / "mod/cache.c").read_text(encoding="utf-8")
    hal = (source_root / "hal/hal_nfc_t2t.c").read_text(encoding="utf-8")
    ntag = (source_root / "ntag/ntag_emu_v2.c").read_text(encoding="utf-8")
    cache_functions = "\n\n".join(function(cache, sig) for sig in (
        "static size_t cache_noinit_size(", "static uint32_t cache_enable_retention(",
        "int32_t cache_clean(", "int32_t cache_save("))
    # Replace only linker-address expressions with host-controlled pointers.
    cache_functions = cache_functions.replace("&__start_noinit", "test_start").replace("&__stop_noinit", "test_end")
    cache_constants = "\n".join(line for line in cache.splitlines() if line.startswith("#define CACHE_RAM_"))
    ntag_prefix = ntag[ntag.index("typedef enum {"):ntag.index("/* One shared snapshot")]
    substitutions = {
        "cache": {"/* ACTUAL_CACHE_FUNCTIONS */": cache_constants + "\n" + cache_functions},
        "nfc": {"/* ACTUAL_NFC_FUNCTIONS */": function(hal, "ret_code_t hal_nfc_send(") + "\n" +
            ntag_prefix + "\n" + function(ntag, "static void nfc_received_process(")},
    }
    with tempfile.TemporaryDirectory(prefix="pixl-de2-host-") as tmp:
        for suite, replacements in substitutions.items():
            code = (tests / ("ec_" + suite + "_host.c")).read_text(encoding="utf-8")
            for marker, replacement in replacements.items():
                assert code.count(marker) == 1
                code = code.replace(marker, replacement)
            c_path = Path(tmp) / (suite + ".c")
            executable = Path(tmp) / (suite + (".exe" if os.name == "nt" else ""))
            c_path.write_text(code, encoding="utf-8")
            command = shlex.split(args.cc) + ["-std=c11", "-O1", "-g", "-Wall", "-Wextra", "-Werror",
                "-Wno-pointer-to-int-cast", "-Wno-unused-parameter", "-I", str(source_root / "ntag")]
            if args.sanitize:
                command += ["-fsanitize=address,undefined", "-fno-omit-frame-pointer"]
            subprocess.run(command + [str(c_path), "-o", str(executable)], check=True, timeout=60)
            subprocess.run([str(executable)], check=True, timeout=45)
    print("PASS: actual-source cache and NFC/HAL host regression suites", flush=True)


if __name__ == "__main__":
    main()
