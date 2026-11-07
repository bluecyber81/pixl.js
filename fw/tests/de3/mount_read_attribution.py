#!/usr/bin/env python3
"""Attribute PackedFS mount reads on synthetic NOR. Requires Linux, GCC and addr2line."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
FW = HERE.parents[1]
CORE = FW / "application/src/mod/vfs"
LFS = FW / "components/littlefs"
OUTCOMES = ("hit", "eligibleMiss", "bypass")


def build(folder):
    # The same narrow HAL contract as the persistence suite. The application,
    # actual mount cache, PackedFS, LittleFS and CRC routines are compiled as-is.
    (folder / "boards.h").write_text("#pragma once\n#define VFS_PACKED_LFS_ENABLE 1\n")
    (folder / "mui_mem.h").write_text(
        "#include <stddef.h>\nvoid *mui_mem_malloc(size_t);\nvoid mui_mem_free(void *);\n")
    (folder / "hal_spi_flash.h").write_text("""#pragma once
#include <stdint.h>
#include <stddef.h>
#define NRF_SUCCESS 0
typedef struct {uint32_t block_size, block_count, page_size;} flash_info_t;
uint32_t hal_spi_flash_init(void);
uint32_t hal_spi_flash_info(flash_info_t *);
uint32_t hal_spi_flash_read(uint32_t, void *, size_t);
uint32_t hal_spi_flash_prog(uint32_t, const void *, size_t);
uint32_t hal_spi_flash_erase(uint32_t);
""")
    exe = folder / "mount-profile"
    inputs = (HERE / "mount_read_attribution.c", HERE / "packed_vfs_nor_de344.c",
              CORE / "vfs_persist.c", LFS / "lfs.c", LFS / "lfs_util.c")
    subprocess.run(["gcc", "-std=c11", "-g", "-O0", "-fno-inline", "-no-pie",
                    "-DLFS_NO_MALLOC", "-DLFS_NO_DEBUG", "-DLFS_NO_WARN", "-DLFS_NO_ERROR",
                    '-DSTORE_CORE="packed_fs.c"', '-DSTORE_ADAPTER="vfs_driver_packed.c"',
                    *["-I" + str(d) for d in (folder, CORE, LFS, HERE)],
                    *map(str, inputs), "-o", str(exe)], check=True, timeout=90)
    return exe


def symbols(exe, addresses):
    ordered = sorted(addresses)
    lines = subprocess.check_output(["addr2line", "-f", "-e", str(exe)],
                                    input="\n".join(ordered) + "\n", text=True).splitlines()
    if len(lines) != len(ordered) * 2:
        raise ValueError("Incomplete DWARF symbol resolution")
    return dict(zip(ordered, zip(lines[::2], lines[1::2])))


def classification(stack, record_source):
    functions = dict(stack)
    if "flash_read" not in functions or "pfs_mount" not in functions:
        raise ValueError("Observer captured an unexpected call path")
    if "read_verified_record" in functions:
        site = functions["read_verified_record"].split(" (", 1)[0]
        filename, line = site.rsplit(":", 1)
        if Path(filename).resolve() != CORE / "packed_fs.c":
            raise ValueError("Unexpected record verifier source")
        call = record_source[int(line) - 1].strip()
        sites = {
            "int r = read_at(fs, io, offset, b, sizeof(b));": "recordHeader",
            "r = read_at(fs, io, offset + RH, info->path, n);": "recordPath",
            "r = read_at(fs, io, pos, fs->copy, length);": "recordMetadataAndPayloadForCRC",
            "r = read_at(fs, io, end, stored, sizeof(stored));": "recordStoredCRC",
        }
        if call not in sites:
            raise ValueError("Review source mapping for record read: " + call)
        stage = sites[call]
    elif "manifest_load" in functions:
        stage = "manifest"
    elif "shard_header" in functions:
        stage = "shardHeader"
    elif "io_open" in functions:
        stage = "openShard"
    elif "read_at" in functions:
        stage = "shardIndexOrFooter"
    elif "lfs_mount" in functions:
        stage = "littlefsMount"
    else:
        stage = "otherMount"

    if "lfs_ctz_find" in functions:
        route = "ctzLink"
    elif "lfs_bd_crc" in functions:
        route = "littlefsMetadataCRC"
    elif "lfs_file_flushedread" in functions:
        route = "fileDataPage"
    else:
        route = "otherLittleFS"
    return stage, route


def add_counts(table, key, values):
    row = table.setdefault(key, dict.fromkeys(OUTCOMES, 0))
    for label, value in zip(OUTCOMES, values):
        row[label] += value


def profile():
    source = (CORE / "packed_fs.c").read_text().splitlines()
    with tempfile.TemporaryDirectory(prefix="packed-mount-profile-") as temp:
        exe = build(Path(temp))
        capture = subprocess.check_output([str(exe)], text=True, timeout=240)
        rows = [line.split() for line in capture.splitlines()]
        if not rows or rows[-1] != ["RECOVERY", "PASS"]:
            raise ValueError("Failed read and clean remount were not observed")
        syms = symbols(exe, {a for r in rows if r[0] == "READS" for a in r[4:]})
        samples = []
        for row in rows[:-1]:
            if row[0] == "SAMPLE":
                figures, repeat, uncached, measured, peak = map(int, row[1:])
                samples.append(dict(figures=figures, repeat=repeat, uncachedReads=uncached,
                                    physicalReads=measured, modelHeapPeakBytes=peak,
                                    packedStage={}, littlefsRoute={}))
            elif row[0] == "READS":
                counts = tuple(map(int, row[1:4]))
                stage, route = classification([syms[a] for a in row[4:]], source)
                add_counts(samples[-1]["packedStage"], stage, counts)
                add_counts(samples[-1]["littlefsRoute"], route, counts)
            else:
                raise ValueError("Unexpected fixture output: " + str(row))
    expected = [(n, r) for n in (100, 500, 952) for r in (1, 2, 3)]
    if [(s["figures"], s["repeat"]) for s in samples] != expected:
        raise ValueError("Incomplete fixed trial")
    for sample in samples:
        tables = (sample["packedStage"], sample["littlefsRoute"])
        for table in tables:
            total = {k: sum(v[k] for v in table.values()) for k in OUTCOMES}
            if (sum(total.values()) != sample["uncachedReads"] or
                    total["eligibleMiss"] + total["bypass"] != sample["physicalReads"]):
                raise ValueError("Attribution totals differ from independent NOR counters")
        for key in ("ctzLink", "fileDataPage", "littlefsMetadataCRC"):
            if key not in sample["littlefsRoute"]:
                raise ValueError("Missing observed LittleFS route " + key)
        for key in ("recordHeader", "recordPath", "recordMetadataAndPayloadForCRC", "recordStoredCRC"):
            if key not in sample["packedStage"]:
                raise ValueError("Missing observed PackedFS stage " + key)
    identities = {p.relative_to(FW).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                  for p in (CORE / "packed_fs.c", CORE / "vfs_driver_packed.c", LFS / "lfs.c",
                            HERE / "packed_vfs_persistence_de344.c",
                            HERE / "mount_read_attribution.c", Path(__file__).resolve())}
    return {"scope": "Host NOR cold mounts. Extra /saved file. Each column table partitions the same read callbacks; do not add the tables.",
            "method": "Diagnostic cache outcomes plus native symbolic call stacks. No change to target sources. Payload/Raw128 checked for every file after each cached mount.",
            "modelHeapPeakBytes": "Simulated allocation high-water for the host ABI during mount, excluding the test harness. Not a target RAM or stack measurement.",
            "hardwareTimingMeasured": False, "targetRAMMeasured": False, "programsDuringMount": 0,
            "erasesDuringMount": 0, "readFailureAndCleanRemountWith952Files": "PASS",
            "sourceSHA256": identities, "samples": samples}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="New JSON result path")
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Choose a new output to preserve earlier evidence")
    data = profile()
    with args.output.open("x", encoding="utf-8") as out:
        json.dump(data, out, indent=2)
        out.write("\n")
    for row in data["samples"][::3]:
        print(row["figures"], row["uncachedReads"], row["physicalReads"], row["littlefsRoute"])
