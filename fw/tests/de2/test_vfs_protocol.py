"""Offline actual-source VFS regression suites; requires only Python and GCC.

python fw/tests/de2/test_vfs_protocol.py [--cc gcc] [--sanitize]
Protocol/core/BLE are included unchanged. SPIFFS functions are extracted from
the current source with hardware calls mocked. No BLE, backup or device access.
"""
import argparse
import os
from pathlib import Path
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
    raise ValueError(signature)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cc", default=os.environ.get("CC", "gcc"))
    parser.add_argument("--sanitize", action="store_true")
    args = parser.parse_args()
    tests = Path(__file__).resolve().parent
    src = tests.parents[1] / "application/src"
    driver = (src / "mod/vfs/vfs_driver_spiffs.c").read_text(encoding="utf-8")
    names = ("static s32_t vfs_spiffs_map_error_code(", "int32_t vfs_spiffs_mount(",
             "int32_t vfs_spiffs_format(", "int32_t vfs_spiffs_stat(",
             "int32_t vfs_spiffs_stat_file(",
             "int32_t vfs_spiffs_close_file(", "int32_t vfs_spiffs_read_file(",
             "int32_t vfs_spiffs_write_file(", "int32_t vfs_spiffs_write_file_data(",
             "int32_t vfs_spiffs_read_file_data(", "int32_t vfs_spiffs_rename_dir_internal(")
    includes = "\n".join('#include "' + (src / p).as_posix() + '"' for p in
        ("mod/df/df_proto_vfs.c", "mod/df/df_core.c", "mod/ble/ble_df_driver.c"))
    suites = {
        "protocol": (tests / "vfs_protocol_host.c").read_text().replace("/* ACTUAL_PROTOCOL_INCLUDES */",includes),
        "spiffs": (tests / "vfs_spiffs_host.c").read_text().replace("/* ACTUAL_SPIFFS_FUNCTIONS */", "\n\n".join(function(driver,n) for n in names)),
    }
    with tempfile.TemporaryDirectory(prefix="pixl-vfs-de2-") as tmp:
        temp = Path(tmp)
        for name, text in {
            "boards.h":"",
            "app_timer.h":"#include <stdint.h>\n#define APP_TIMER_TICKS(ms) (ms)\nstatic inline uint32_t app_timer_cnt_get(void) { return 0; }\nstatic inline uint32_t app_timer_cnt_diff_compute(uint32_t now,uint32_t before) { return (now-before)&0xffffff; }\n",
            "nrf_log.h":"#define NRF_LOG_INFO(...) ((void)0)\n",
            "nrf_log_ctrl.h":"#define NRF_LOG_FLUSH() ((void)0)\n",
            "nrf_pwr_mgmt.h":"",
        }.items():
            (temp/name).write_text(text)
        for suite, code in suites.items():
            cfile=temp/(suite+".c"); exe=temp/(suite+(".exe" if os.name=="nt" else ""))
            cfile.write_text(code,encoding="utf-8")
            command=shlex.split(args.cc)+["-std=c11","-O1","-g","-Wall","-Wextra",
                "-Wno-unused-parameter","-Wno-sign-compare","-Wno-return-type","-I",str(temp)]
            for folder in ("mod/df","mod/vfs","mod/ble"):
                command += ["-I",str(src/folder)]
            if args.sanitize:
                command += ["-fsanitize=address,undefined","-fno-omit-frame-pointer"]
            subprocess.run(command+[str(cfile),"-o",str(exe)],check=True,timeout=60)
            subprocess.run([str(exe)],check=True,timeout=45)
    print("PASS VFS protocol and SPIFFS regression suites")


if __name__=="__main__":
    main()
