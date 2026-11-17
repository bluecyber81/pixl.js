"""Actual LCD fault capture and reassembled BLE build/fault report, no device access."""
import ast
import inspect
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

import test_dfu_transfer_guard as df
import test_fault_reset_de346 as fault

HERE = Path(__file__).resolve().parent
SRC = HERE.parents[1] / "application/src"


class BuildFaultTests(unittest.TestCase):
    def test_fault_lifecycle(self):
        base = fault.FaultResetTests()
        source = base.code() + '\n#define PIXL_RUNTIME_DIAGNOSTICS 1\n#define BOARD_LCD 1\n'
        source += '#define __DMB() do {assert(irq);} while(0)\n'
        source += f'#include "{(SRC/"app_error_handler.c").as_posix()}"\n'
        source += (HERE/"fault_note_de384.c.in").read_text()
        for debug in (False, True):
            base.run_c(source, debug)

    def test_actual_transport(self):
        tree = ast.parse(inspect.getsource(df.main))
        stubs = next(ast.literal_eval(n.value) for n in ast.walk(tree) if isinstance(n, ast.Assign)
                     and any(isinstance(t, ast.Name) and t.id == "stubs" for t in n.targets))
        sample = "0123456789abcdef" * 4
        stubs["version2.h"] += f'static inline const char *version_get_source_id(void){{return "{sample}";}}\n'
        stubs["hal_spi_flash.h"] = "static int hal_spi_flash_cached_jedec(uint8_t *p){abort();}\n"
        stubs["mui_core.h"] = """typedef struct {int initialized,auto_update,u8g2;} mui_t;
static mui_t *mui(void){abort();}
static unsigned u8g2_GetBufferTileHeight(const void *p){abort();}
static unsigned u8g2_GetBufferTileWidth(const void *p){abort();}
static uint8_t *u8g2_GetBufferPtr(const void *p){abort();}
"""
        stubs["mbedtls/sha256.h"] = "static int mbedtls_sha256_ret(const uint8_t *p,size_t s,uint8_t *out,int m){abort();}\n"
        harness = (HERE/"ble_mtu_host.c").read_text().split("int main(",1)[0]
        protocol = '\n'.join(f'#include "{(SRC/p).as_posix()}"' for p in df.PRODUCTION)
        # Only this diagnostic is under test. The established, independent
        # runtime/heap capture uses its optional no-op backend in this fixture.
        preamble = f'#include "{(SRC/"mod/runtime_diag.h").as_posix()}"\n'
        harness = harness.replace("/* ACTUAL_PROTOCOL_INCLUDES */", preamble + """
#ifdef TEST_CAPABLE_LCD
#define LCD_SCREEN 1
#define PIXL_RUNTIME_DIAGNOSTICS 1
#endif
""" + protocol)
        ble = (SRC/"mod/ble/ble_main.c").read_text()
        harness = harness.replace("/* ACTUAL_BLE_FUNCTIONS */",'\n'.join(df.function(ble,s) for s in (
            "ret_code_t ble_nus_tx_data(", "size_t ble_nus_max_data_length(", "void ble_nus_abort_transfer(")))
        harness += (HERE/"build_fault_wire_de384.c.in").read_text()
        with tempfile.TemporaryDirectory(prefix="lcd-build-fault-") as tmp:
            folder = Path(tmp)
            for name,contents in stubs.items():
                dest = folder/name
                dest.parent.mkdir(exist_ok=True)
                dest.write_text(contents)
            source = folder/"wire.c"
            source.write_text(harness)
            for capable in (False, True):
                binary = folder/("lcd.exe" if capable else "legacy.exe")
                flags = ["-DTEST_CAPABLE_LCD=1"] if capable else []
                if os.environ.get("PIXL_SANITIZE") == "1":
                    flags += ["-fsanitize=address,undefined","-fno-sanitize-recover=all","-fno-omit-frame-pointer","-no-pie"]
                includes = [folder,SRC/"mod/df",SRC/"mod/vfs",SRC/"mod/ble"]
                subprocess.run(["gcc","-std=c11","-O1",*flags,*["-I"+str(i) for i in includes],str(source),
                                "-o",str(binary)],check=True,timeout=60)
                subprocess.run([binary],check=True,timeout=30)


if __name__ == "__main__":
    unittest.main()
