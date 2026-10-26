"""Actual-source ownership regression for Nordic nRF52832 anomaly 218.

Mocked registers and SDK primitives; no radio, device, or timing validation.
The test feeds the frame-delay value left by Chameleon's bit transmitter into
the real nrfx uninit -> custom start sequence. --hal-source can select DE3.21
to demonstrate the pre-fix failure without editing that baseline.
"""
from pathlib import Path
import argparse
import os
import re
import shutil
import subprocess
import tempfile


def function(source, name):
    match = list(re.finditer(r"(?m)^[^\n;{}]*\b" + re.escape(name) +
                            r"\s*\([^;{}]*\)\s*\{", source))[-1]
    opening = source.index("{", match.start())
    depth = 1
    for end in range(opening + 1, len(source)):
        depth += (source[end] == "{") - (source[end] == "}")
        if depth == 0:
            return source[match.start():end + 1]
    raise ValueError(name)


def common_setup(source):
    # The two conditional declarations share one unchanged function body.
    start = source.index("static void hal_nfc_common_hw_setup()")
    opening = source.index("{", start)
    depth = 1
    for end in range(opening + 1, len(source)):
        depth += (source[end] == "{") - (source[end] == "}")
        if depth == 0:
            return "static void hal_nfc_common_hw_setup(void) " + source[opening:end + 1]
    raise ValueError("hal_nfc_common_hw_setup")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hal-source", type=Path)
    args = parser.parse_args()
    tests = Path(__file__).resolve().parent
    fw = tests.parents[1]
    hal_path = args.hal_source or fw / "application/src/hal/hal_nfc_t2t.c"
    hal = hal_path.read_text(encoding="utf-8")
    driver = (fw / "application/src/sdk/nrfx/nrfx_nfct.c").read_text(encoding="utf-8")
    chameleon = (fw / "components/chameleon-ultra/firmware/application/src/rfid/nfctag/hf/nfc_14a.c").read_text(encoding="utf-8")
    bit_core = re.search(r"#define NFC_14A_TX_BITS_CORE\(bits, mode\)(.*?)\n\n", chameleon, re.S).group(1)
    inherited = int(re.search(r"nrf_nfct_frame_delay_max_set\((\d+)\)", bit_core).group(1))
    actual = "\n\n".join([
        function(driver, "nrfx_nfct_disable"),
        function(driver, "nrfx_nfct_uninit"),
        common_setup(hal),
        function(hal, "hal_nfc_start"),
        function(hal, "hal_nfc_re_setup"),
    ])
    template = (tests / "nfc_frame_delay_host.c").read_text(encoding="utf-8")
    code = template.replace("/* ACTUAL_SOURCE */", actual).replace("INHERITED_DELAY", str(inherited))
    cc = shutil.which("gcc")
    if not cc:
        raise RuntimeError("Existing gcc required; test is not skipped")
    with tempfile.TemporaryDirectory(prefix="pixl-nfc-frame-delay-") as tmp:
        path = Path(tmp) / "nfc_frame_delay.c"
        exe = Path(tmp) / ("nfc_frame_delay.exe" if os.name == "nt" else "nfc_frame_delay")
        path.write_text(code, encoding="utf-8")
        command = [cc, "-std=c11", "-O1", "-g", "-Wall", "-Wextra", "-Werror"]
        if os.environ.get("PIXL_SANITIZE") == "1":
            command += ["-fsanitize=address,undefined", "-fno-omit-frame-pointer"]
        subprocess.run(command + [str(path), "-o", str(exe)], check=True, timeout=60)
        subprocess.run([str(exe)], check=True, timeout=30)
    print("PASS DE3.22 actual-source NFC frame-delay ownership regression")


if __name__ == "__main__":
    main()
