"""Actual C batch READ/SHA contract on PackedFS synthetic NOR and df_core.

PIXL_SANITIZE=1 enables ASan/UBSan; PIXL_ARM32=1 uses ARM32 Linux/QEMU.
The physical SPI/radio and allocator are substitutes; no device access.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
FW = HERE.parents[1]


class BatchReadTests(unittest.TestCase):
    def test_actual_protocol_packedfs_and_core(self):
        vfs = FW / "application/src/mod/vfs"
        df = FW / "application/src/mod/df"
        ble = FW / "application/src/mod/ble"
        lfs = FW / "components/littlefs"
        vendor = HERE / "boot_diag_fixture"
        arm = os.environ.get("PIXL_ARM32") == "1"
        sanitize = os.environ.get("PIXL_SANITIZE") == "1" and not arm
        compiler = shutil.which("arm-linux-gnueabihf-gcc" if arm else "gcc")
        self.assertIsNotNone(compiler)
        sources = [df / name for name in ["df_proto_vfs.c", "df_proto_vfs.h", "df_core.c", "df_core.h",
                                         "df_small_create.c", "df_small_create.h", "df_buffer.h", "df_defines.h"]]
        sources += [vfs / name for name in ["packed_fs.c", "packed_fs.h", "vfs_driver_packed.c", "vfs.h",
                                           "vfs_packed_runtime.h", "vfs_persist.c", "vfs_persist.h", "vfs_meta.c", "vfs_meta.h"]]
        sources += [HERE / name for name in ["batch_read_de397.c", "packed_vfs_persistence_de344.c",
                                             "packed_vfs_nor_de344.c", "packed_vfs_nor_de344.h", "packed_test_mui_mem.h"]]
        sources += [vendor / "sha256.c", vendor / "mbedtls/sha256.h"]
        sources += [lfs / name for name in ["lfs.c", "lfs.h", "lfs_util.c", "lfs_util.h"]]
        sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
        before = {str(p.relative_to(FW)): sha(p) for p in sources}
        with tempfile.TemporaryDirectory(prefix="pixl-batch-de397-") as tmp:
            temp = Path(tmp)
            headers = {
                "nrf_log.h": "#define NRF_LOG_INFO(...) ((void)0)\n",
                "nrf_pwr_mgmt.h": "",
                "ble_work.h": "#include <stdbool.h>\nbool ble_work_can_send(void);\n",
                "ble_main.h": "#include <stddef.h>\nvoid ble_disable(void);\nsize_t ble_nus_max_data_length(void);\nvoid ble_nus_abort_transfer(void);\n",
                "utils2.h": "#pragma once\n#include <stdbool.h>\nbool enter_dfu(void);\nbool system_reboot(void);\nbool system_prepare_reset(void);\nbool system_reset_prepared(void);\nvoid system_cancel_reset(void);\n",
                "boards.h": "#pragma once\n#define VFS_PACKED_LFS_ENABLE 1\n",
                "hash_config.h": "#define MBEDTLS_SHA256_C\n",
                "app_timer.h": """#pragma once
#include <stdint.h>
#define APP_TIMER_CONFIG_RTC_FREQUENCY 1u
#define APP_TIMER_CLOCK_FREQ 32768u
#define APP_TIMER_TICKS(x) (x)
#define APP_TIMER_MODE_SINGLE_SHOT 0
#define APP_TIMER_DEF(id) static unsigned id
#define NRF_SUCCESS 0
int app_timer_create(unsigned *, unsigned, void (*)(void *));
int app_timer_start(unsigned, unsigned, void *);
int app_timer_stop(unsigned);
static inline uint32_t app_timer_cnt_get(void) { return 0; }
static inline uint32_t app_timer_cnt_diff_compute(uint32_t a, uint32_t b) { return (a-b)&0xffffffu; }
""",
                "hal_spi_flash.h": """#pragma once
#include <stdint.h>
#include <stddef.h>
#define NRF_SUCCESS 0
typedef struct { uint32_t block_size,block_count,page_size; } flash_info_t;
uint32_t hal_spi_flash_init(void);uint32_t hal_spi_flash_info(flash_info_t*);
uint32_t hal_spi_flash_read(uint32_t,void*,size_t);uint32_t hal_spi_flash_prog(uint32_t,const void*,size_t);
uint32_t hal_spi_flash_erase(uint32_t);
""",
            }
            for name, content in headers.items():
                (temp / name).write_text(content, encoding="utf-8")
            (temp / "mui_mem.h").write_bytes((HERE / "packed_test_mui_mem.h").read_bytes())
            exe = temp / "contract"
            command = [compiler, "-std=c11", "-O1", "-g", "-Wall", "-Wextra", "-Werror",
                       "-Wno-unused-function", "-Wno-misleading-indentation", "-Wno-sign-compare",
                       "-DLFS_NO_MALLOC", "-DLFS_NO_DEBUG", "-DLFS_NO_WARN", "-DLFS_NO_ERROR",
                       "-DPIXL_RUNTIME_DIAGNOSTICS=1", "-DVFS_PACKED_LFS_ENABLE=1",
                       "-DPIXL_SMALL_CREATE_ENABLE=1", "-DPIXL_FILE_DIGEST_ENABLE=1",
                       '-DMBEDTLS_CONFIG_FILE="hash_config.h"']
            for macro, path in {"CONTRACT": HERE / "packed_vfs_persistence_de344.c", "PROTOCOL": df / "df_proto_vfs.c",
                                "CORE": df / "df_core.c", "STORE_CORE": vfs / "packed_fs.c",
                                "STORE_ADAPTER": vfs / "vfs_driver_packed.c"}.items():
                command += [f'-D{macro}="{path.as_posix()}"']
            for path in [temp, vfs, lfs, HERE, df, ble, vendor]:
                command += ["-I", str(path)]
            command += [str(p) for p in [HERE / "batch_read_de397.c", HERE / "packed_vfs_nor_de344.c",
                                         df / "df_small_create.c", vfs / "vfs_meta.c", vendor / "sha256.c",
                                         vfs / "vfs_persist.c", lfs / "lfs.c", lfs / "lfs_util.c"]]
            if os.environ.get('PIXL_GROUP_CREATE_TEST') == '1':
                command += ['-DPIXL_GROUP_CREATE_ENABLE=1', str(df / 'bulk_wire.c'), str(df.parent / 'vfs/pfs_guard_new.c')]
            command += ["-o", str(exe)]
            if arm:
                command += ["-static"]
            elif sanitize:
                command += ["-fsanitize=address,undefined", "-fno-sanitize-recover=all", "-fno-omit-frame-pointer", "-fno-pie", "-no-pie"]
            compiled = subprocess.run(command, capture_output=True, text=True, timeout=60)
            self.assertEqual(compiled.returncode, 0, compiled.stdout + compiled.stderr)
            run = subprocess.run((["qemu-arm"] if arm else []) + [str(exe)], capture_output=True, text=True, timeout=120)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            result = [json.loads(line) for line in run.stdout.splitlines() if line.startswith("{")]
            self.assertEqual(len(result), 1)
            result = result[0]
            self.assertTrue(result["passed"])
            self.assertEqual(result["liveAtEnd"], 0)
            self.assertEqual(result["maxReadOwnedHeap"], 2289)
            self.assertEqual(result["maxDigestOwnedHeap"], 701)
            self.assertGreater(result["allocationFailures"], 1)
            self.assertGreater(result["ioFailures"], 1)
            self.assertGreater(result["lifecycleCases"], 150)
            self.assertEqual(before, {str(p.relative_to(FW)): sha(p) for p in sources})
            print(run.stdout.strip())
            if destination := os.environ.get("PIXL_BATCH_REPORT"):
                report = dict(passed=True, deviceAccess=False, arm32=arm, sanitize=sanitize,
                              asanOptions=os.environ.get("ASAN_OPTIONS", "") if sanitize else None,
                              sourceHashes=before, sourcesUnchanged=True, observations=result,
                              limitations=["Synthetic NOR and bounded malloc; not physical SPI/BLE timing or TLSF overhead.",
                                           "Transport substitutes notification completion and abort/disconnect; df_core is actual source.",
                                           "The caller's accepted request/reply contract is exercised; no browser or multi-file atomic filesystem snapshot claim.",
                                           "ARM32/QEMU, if enabled, checks 32-bit ABI, not Cortex-M4 timing or whole-firmware stack."])
                if sanitize and "detect_leaks=0" in os.environ.get("ASAN_OPTIONS", ""):
                    report["limitations"].append("LeakSanitizer end inspection disabled because the executor uses ptrace; ASan/UBSan and the explicit zero-live-allocation checks remain enabled.")
                Path(destination).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
