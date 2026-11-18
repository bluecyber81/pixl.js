"""Exercise both OLED storage drivers against a selectable NOR capacity model."""
import argparse
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
from slot_scene_fixture import render_slot_scene

FW = Path(__file__).resolve().parents[2]
APP = FW / "application/src"
MOD = APP / "mod"
VFS = MOD / "vfs"
SPIFFS = FW / "components/spiffs/src"
LFS = FW / "components/littlefs"

def run(sanitize, reference_engines=None, blocks=512):
    with tempfile.TemporaryDirectory(prefix="pixl-oled-fs-") as temp:
        out = Path(temp)
        headers = {
            "boards.h": "#define BOARD_OLED\n#define VFS_OLED_AUTO_ENABLE\n#define VFS_LFS_ENABLE\n#define VFS_SPIFFS_ENABLE\n",
            "mui_mem.h": "#include <stddef.h>\nvoid *mui_mem_malloc(size_t); void mui_mem_free(void *);",
            "nrf_log.h": "#define NRF_LOG_INFO(...) ((void)0)\n#define NRF_LOG_WARNING(...) ((void)0)\n#define nrf_log_push(x) (x)\n",
            "nrf_log_ctrl.h": "",
            "m-string.h": "",
            "hal_spi_flash.h": "#pragma once\n#include <stdint.h>\n#include <stddef.h>\n#define NRF_SUCCESS 0\ntypedef int ret_code_t; typedef struct {uint32_t block_size,block_count,page_size;} flash_info_t; ret_code_t hal_spi_flash_init(void); ret_code_t hal_spi_flash_info(flash_info_t *); ret_code_t hal_spi_flash_read(uint32_t,void *,size_t); ret_code_t hal_spi_flash_prog(uint32_t,const void *,size_t); ret_code_t hal_spi_flash_erase(uint32_t);",
        }
        for name, text in headers.items():
            (out / name).write_text(text)
        cc = shlex.split(os.environ.get("CC", "gcc"))
        cc += ["-std=c11", "-O1", "-g", "-include", "stdint.h", "-DLFS_NO_DEBUG", "-DLFS_NO_WARN", "-DLFS_NO_ERROR", "-DLFS_NO_MALLOC", f"-DBLOCKS={blocks}u"]
        if sanitize:
            cc += ["-fsanitize=address,undefined", "-fno-sanitize-recover=all", "-fno-omit-frame-pointer", "-fno-pie", "-no-pie"]
        references = []
        if reference_engines:
            # v2.21.0's pinned pellepl/spiffs source and spiffs_config.h in
            # spiffs/, v2.27.11's pinned littlefs-project/littlefs in lfs/.
            ref_spiffs = reference_engines / "spiffs"
            ref_lfs = reference_engines / "lfs"
            seed = out / ("seed.exe" if os.name == "nt" else "seed")
            # The historical upstream writer uses unaligned page-index stores.
            # Generate the reference bytes uninstrumented. Sanitize the DE
            # reader/writer and its libraries with the full flag set below.
            seed_cc = shlex.split(os.environ.get("CC", "gcc")) + [
                "-std=c11", "-O1", "-g", "-include", "stdint.h", "-DLFS_NO_MALLOC",
                "-DLFS_NO_DEBUG", "-DLFS_NO_WARN", "-DLFS_NO_ERROR", "-DOLED_REFERENCE_GENERATOR", f"-DBLOCKS={blocks}u"]
            for directory in (out, ref_spiffs, ref_lfs, VFS):
                seed_cc += ["-I", str(directory)]
            seed_sources = [Path(__file__).with_name("oled_storage_host.c"), ref_lfs / "lfs.c", ref_lfs / "lfs_util.c",
                            *sorted(ref_spiffs.glob("*.c"))]
            subprocess.run(seed_cc + list(map(str, seed_sources)) + ["-o", str(seed)], check=True, timeout=120)
            references = [str(out / "spiffs.img"), str(out / "littlefs.img")]
            subprocess.run([str(seed), *references], check=True, timeout=45)
        # The simulator calls the actual Save As scene and the same assertions
        # used for PackedFS, then exercises favorites on this mounted driver.
        slot_cases = out / "slots.c"
        slot_cases.write_text(
            '#include <assert.h>\n#include <stdio.h>\n#include <string.h>\n'
            '#include "vfs_persist.h"\n#define REQUIRE(x) assert(x)\n' +
            render_slot_scene(out, Path(__file__).parent, APP), encoding="utf-8")
        cc += ["-ffunction-sections", "-fdata-sections", "-Wl,--gc-sections"]
        for directory in (out, VFS, MOD, SPIFFS, LFS, FW / "components/cwalk/include",
                          APP, APP / "app/amiidb/api", APP / "app/amiidb/scene",
                          APP / "amiidb", APP / "ntag", MOD / "df", APP / "i18n"):
            cc += ["-I", str(directory)]
        sources = [Path(__file__).with_name("oled_storage_host.c"), MOD / "cwalk2.c", FW / "components/cwalk/src/cwalk.c",
                   VFS / "vfs.c", VFS / "vfs_driver_lfs.c", VFS / "vfs_driver_spiffs.c", VFS / "vfs_persist.c",
                   slot_cases, APP / "app/amiidb/api/amiidb_api_slot.c", APP / "app/amiidb/api/amiidb_api_fav.c",
                   VFS / "vfs_meta.c", VFS / "vfs_set_readonly.c", APP / "amiidb/db_search.c",
                   APP / "amiidb/db_amiibo.c", APP / "amiidb/db_link.c", APP / "i18n/de_DE.c",
                   LFS / "lfs.c", LFS / "lfs_util.c", *sorted(SPIFFS.glob("*.c"))]
        binary = out / ("probe.exe" if os.name == "nt" else "probe")
        subprocess.run(cc + list(map(str, sources)) + ["-o", str(binary)], check=True, timeout=150)
        subprocess.run([str(binary), *references], check=True, timeout=45)

if __name__ == "__main__":
    options = argparse.ArgumentParser(description=__doc__)
    options.add_argument("--sanitize", action="store_true")
    options.add_argument("--reference-engines", type=Path)
    options.add_argument("--blocks", type=int, choices=(512, 1024, 2048, 4096), default=512,
                         help="Number of 4096-byte blocks: 2, 4, 8 or 16 MiB")
    args = options.parse_args()
    run(args.sanitize, args.reference_engines, args.blocks)
