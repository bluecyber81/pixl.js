"""Verify a signed DE3.81 OLED trial against its sources and repeat build."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import sys

from cryptography.hazmat.primitives.asymmetric import ec

from check_release_ota import need, unique_json, verify_zip

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "fw/scripts"))
from application_budget import check_budget
from production_id import fingerprint, source_hashes


def digest(data):
    return hashlib.sha256(data).hexdigest()


TRIALS = {
    1: ("2.22.0-DE3.81-OLEDt1", 81),
    2: ("2.22.0-DE3.81-OLEDt2", 82),
    3: ("2.22.0-DE3.81-OLEDt3", 83),
    4: ("2.22.0-DE3.84-OLEDt4", 84),
}


def check(primary, repeat, ota, trial=1):
    version, counter = TRIALS[trial]
    for build in (primary, repeat):
        record = unique_json((build / "BUILD_RESULT.json").read_bytes())
        need((record["board"], record["mode"], record["status"], record["version"], record["counter"]) ==
             ("OLED", "development", "unsigned_development", version, counter), "Unexpected build identity")
        for artifact in ("pixljs.bin", "pixljs.hex", "pixljs.map", "pixljs.out"):
            need(digest((build / artifact).read_bytes()) == record["artifacts_sha256"][artifact],
                 "Changed build output: " + artifact)
        need(record["linker_budget"] == check_budget((build / "pixljs.map").read_text(),
             (build / "pixljs.bin").stat().st_size), "Changed linker budget")
        inputs = unique_json((build / "production-inputs.json").read_bytes())
        need(inputs == source_hashes(ROOT / "fw"), "Firmware sources differ from the build")
        source_id = fingerprint(inputs)
        need(source_id == record["source_id_sha256"], "Source ID mismatch")
    for artifact in ("pixljs.bin", "pixljs.hex", "production-inputs.json"):
        need((primary / artifact).read_bytes() == (repeat / artifact).read_bytes(), "Repeat build: " + artifact)
    binary = (primary / "pixljs.bin").read_bytes()
    need(binary.count(source_id.encode() + b"\0") == 1 and version.encode() + b"\0" in binary,
         "Missing embedded OLED version or source identity")
    stack, entry = struct.unpack_from("<II", binary)
    need(stack == 0x20010000 and entry & 1 and 0x19000 <= entry - 1 < 0x19000 + len(binary) <= 0x74000,
         "Invalid application vectors or flash region")
    public_source = (ROOT / "fw/bootloader/src/dfu_public_key.c").read_text()
    initializer = re.search(r"pk\[64\]\s*=\s*\{([^}]+)\}", public_source).group(1)
    public = bytes(int(item, 16) for item in re.findall(r"0x([0-9a-fA-F]{2})", initializer))
    # Independently matched to both original cylin577 OLED application signatures.
    need(digest(public) == "9ee942fb8b5fa84aa3287f02451c7f2bf2168f5df2c97af253172d2e90f03a83",
         "Unexpected bootloader public key")
    key = ec.EllipticCurvePublicNumbers(int.from_bytes(public[:32], "little"),
                                        int.from_bytes(public[32:], "little"), ec.SECP256R1()).public_key()
    release = {"counter": counter, "hardware_version": 52, "softdevice_requirements": ["0x0103"]}
    result = verify_zip(ota, binary, release, key)
    return {"version": version, "board": "OLED SH1106 128x64", "source_id": source_id,
            "repeat_bin_hex_match": True, "memory": record["linker_budget"], "ota": result}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("primary_build", type=Path)
    parser.add_argument("repeat_build", type=Path)
    parser.add_argument("ota", type=Path)
    parser.add_argument("--trial", type=int, choices=TRIALS, default=1)
    args = parser.parse_args()
    print(json.dumps(check(args.primary_build, args.repeat_build, args.ota, args.trial), indent=2))
