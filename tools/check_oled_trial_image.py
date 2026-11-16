"""Verify the ARM ELF, Intel HEX and raw DFU input of an OLED app-only build."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import tempfile


def verify(directory, version, counter):
    elf = directory / "pixljs.out"
    binary = (directory / "pixljs.bin").read_bytes()
    build = json.loads((directory / "BUILD_RESULT.json").read_bytes())
    if (build["board"], build["version"], build["counter"], build["status"]) != (
            "OLED", version, counter, "unsigned_development"):
        raise ValueError("unexpected production build identity")
    if not binary or binary.count(version.encode("ascii") + bytes(1)) != 1:
        raise ValueError("missing/ambiguous embedded version")
    source_id = build["source_id_sha256"].encode("ascii") + bytes(1)
    if binary.count(source_id) != 1:
        raise ValueError("missing/ambiguous embedded source ID")
    # Regenerate both formats from the linked ELF. This checks every HEX
    # address and all sections, including any unintended UICR/MBR content.
    with tempfile.TemporaryDirectory() as temp:
        for fmt, ext in [("binary", "bin"), ("ihex", "hex")]:
            output = Path(temp) / ("pixljs." + ext)
            subprocess.run(["arm-none-eabi-objcopy", "-O", fmt, elf, output], check=True)
            if output.read_bytes() != (directory / output.name).read_bytes():
                raise ValueError("ELF differs from " + ext)
    symbols = {}
    for row in subprocess.check_output(["arm-none-eabi-nm", "-n", elf], text=True).splitlines():
        parts = row.split()
        if len(parts) == 3:
            symbols[parts[2]] = int(parts[0], 16)
    for required in ("u8g2_Setup_sh1106_128x64_noname_f", "vfs_spiffs_mount", "vfs_lfs_mount"):
        if required not in symbols:
            raise ValueError("missing linked OLED or filesystem function " + required)
    if "u8g2_Setup_st7567_enh_dg128064_f" in symbols:
        raise ValueError("unexpected ST7567 driver")
    start = symbols["__isr_vector"]
    stack, reset_vector = struct.unpack_from("<II", binary)
    if (start, stack, reset_vector) != (0x19000, 0x20010000, symbols["Reset_Handler"] | 1):
        raise ValueError("invalid application vector table")
    if not start <= (reset_vector & ~1) < start + len(binary) <= 0x74000:
        raise ValueError("application crosses firmware slot")
    print(json.dumps({"board": build["board"], "version": version, "counter": counter,
                      "bytes": len(binary), "app_start": hex(start), "app_end_exclusive": hex(start + len(binary)),
                      "initial_sp": hex(stack), "reset_vector": hex(reset_vector),
                      "source_id": build["source_id_sha256"], "sha256": hashlib.sha256(binary).hexdigest(),
                      "elf_hex_bin_equal": True, "linker_budget": build["linker_budget"]}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--version", required=True)
    parser.add_argument("--counter", required=True, type=int)
    args = parser.parse_args()
    verify(args.directory, args.version, args.counter)
