"""Exercise the current file reader, tag selection and NFC replies using two fake V3 images.

Run from a checkout with Python and GCC. No device, private keys, downloads or
amiibo dumps are used. The RF peripheral and filesystem are modelled on the host.
"""
import argparse
from importlib.util import module_from_spec, spec_from_file_location
import os
from pathlib import Path
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
# Two published rider model IDs. Every other fixture byte is artificial.
MODELS = (("Dragoon", "1f00010004c51e03"), ("Hydra", "1f02010004c81e03"))


def run(fw):
    fixture_sources = fw / "application/src"
    sector_test = fw / "tests/de3/test_nfc_sector_de352.py"
    spec = spec_from_file_location("sector_test", sector_test)
    sector = module_from_spec(spec)
    spec.loader.exec_module(sector)
    nfc = (fixture_sources / "ntag/ntag_emu_v2.c").read_text(encoding="utf8")
    detail = (fixture_sources / "app/amiibo/scene/amiibo_scene_amiibo_detail.c").read_text(encoding="utf8")
    host_source = sector.harness(fw).split("static unsigned scenarios;")[0]
    scenario = (HERE / "kirby_v3_machine_host.c.in").read_text(encoding="utf8")
    extract = sector.helper.function
    scenario = scenario.replace("/* REAL_LOAD */", extract(detail, "static int32_t ntag_read("))
    install = extract(nfc, "void ntag_emu_set_uuid_only(") + "\n" + extract(nfc, "bool ntag_emu_set_tag(")
    scenario = scenario.replace("/* REAL_INSTALL */", install)
    machines = [bytes((n * 23 + 31 * v) % 256 for n in range(64)) for v in range(len(MODELS))]
    with tempfile.TemporaryDirectory() as temp:
        folder = Path(temp)
        src = folder / "test.c"
        exe = folder / ("test.exe" if os.name == "nt" else "test")
        src.write_text(host_source + "\n" + scenario, encoding="utf8")
        (folder / "boards.h").write_text("", encoding="utf8")
        subprocess.run([os.environ.get("CC", "gcc"), "-std=c11", "-O2", "-Wall", "-Wextra", "-Werror",
                        "-Wno-unused-function", "-Wno-unused-parameter", "-Wno-pointer-to-int-cast",
                        "-I", str(folder), "-I", str(fixture_sources / "ntag"),
                        "-I", str(fixture_sources / "mod/vfs"), str(src), "-o", str(exe)], check=True)
        for index, (name, model_id) in enumerate(MODELS):
            image = bytearray((n * 13 + index) % 256 for n in range(2048))
            image[84:92] = bytes.fromhex(model_id)
            # Both reader paths must supply the ready flag when the image lacks it.
            image[0xED * 4 + 2] &= ~0x08
            image[960:1024] = machines[index]
            result = subprocess.run([str(exe)], input=image + machines[index] + machines[1-index],
                                    capture_output=True, check=True)
            print(name + " " + result.stdout.decode().strip())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--firmware-root", type=Path, default=HERE.parents[1])
    run(parser.parse_args().firmware_root.resolve())
