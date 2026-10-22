"""Compile actual NTAG lifecycle and HAL ownership functions with host primitives.

No RF/device access. Normal and interrupted paths, reentrant callbacks, timer
generations, init/stop ordering and nRF52832 Timer4/HFCLK handoff are exercised.
"""
from pathlib import Path
import os
import re
import shutil
import subprocess
import tempfile


def function(source, name):
    matches = list(re.finditer(r"(?m)^[^\n;{}]*\b" + re.escape(name) + r"\s*\([^;{}]*\)\s*\{", source))
    match = matches[-1]  # nRF52832 workaround is the final conditional definition.
    opening = source.index("{", match.start())
    depth = 1
    for i in range(opening + 1, len(source)):
        depth += (source[i] == "{") - (source[i] == "}")
        if not depth:
            return source[match.start():i + 1]
    raise ValueError(name)


def main():
    tests = Path(__file__).resolve().parent
    src = tests.parents[1] / "application/src"
    ntag = (src / "ntag/ntag_emu_v2.c").read_text(encoding="utf-8")
    hal = (src / "hal/hal_nfc_t2t.c").read_text(encoding="utf-8")
    sources = {
        "nfc_lifecycle_host": re.sub(r"(?m)^\s*#include[^\n]*\n", "", ntag),
        "nfc_owner_host": "\n\n".join(function(hal, name) for name in [
            "nrf_nfct_clock_event_handler", "hal_nfc_events_clear", "hal_nfc_stop", "hal_nfc_start", "hal_nfc_set_nrfx_irq_enable",
            "hal_nfc_re_setup", "hal_nfc_field_check", "nrf_nfct_field_event_handler", "TIMER4_IRQHandler"]),
    }
    cc = shutil.which("gcc")
    if not cc:
        raise RuntimeError("An existing gcc is required; tests are not skipped")
    with tempfile.TemporaryDirectory(prefix="pixl-nfc-lifecycle-") as tmp:
        for name, actual in sources.items():
            path = Path(tmp) / (name + ".c")
            exe = Path(tmp) / (name + (".exe" if os.name == "nt" else ""))
            code = (tests / (name + ".c")).read_text(encoding="utf-8").replace("/* ACTUAL_SOURCE */", actual)
            path.write_text(code, encoding="utf-8")
            command = [cc, "-std=c11", "-O1", "-g", "-Wall", "-Wextra", "-Werror",
                       "-Wno-unused-parameter", "-I", str(src / "ntag")]
            if os.environ.get("PIXL_SANITIZE") == "1":
                command += ["-fsanitize=address,undefined", "-fno-omit-frame-pointer"]
            subprocess.run(command + [str(path), "-o", str(exe)], check=True, timeout=60)
            subprocess.run([str(exe)], check=True, timeout=30)
    print("PASS DE3.3 NFC lifecycle/ownership actual-source suites")


if __name__ == "__main__":
    main()
