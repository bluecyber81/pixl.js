"""Exercise the production LCD handler with real u8g2 buffer access and SDK SHA-256."""
import hashlib
from pathlib import Path
import subprocess
import tempfile
from test_ble_mtu import function

HERE = Path(__file__).resolve().parent
FW = HERE.parents[1]
DF = FW / "application/src/mod/df"
SDK = HERE / "boot_diag_fixture"


def main():
    handler = function((DF / "df_proto_info.c").read_text(), "static void df_proto_handler_info_display_page(")
    with tempfile.TemporaryDirectory(prefix="pixl-display-photo-") as directory:
        temp = Path(directory)
        (temp / "mbedtls_test.h").write_text("#define MBEDTLS_SHA256_C\n")
        harness = (HERE / "display_photo_host.c").read_text().replace("/* PRODUCTION_HANDLER */", handler)
        source = temp / "lcd.c"
        source.write_text(harness)
        exe = temp / "lcd.exe"
        subprocess.run(["gcc", "-std=c11", "-Wall", "-Wextra", "-Werror", "-O1",
                        '-DMBEDTLS_CONFIG_FILE="mbedtls_test.h"', "-I", str(temp), "-I", str(SDK),
                        "-I", str(DF), "-I", str(FW / "components/u8g2/csrc"), str(source),
                        str(SDK / "sha256.c"), "-o", str(exe)], check=True, timeout=60)
        result = subprocess.run([str(exe)], check=True, timeout=15, capture_output=True)
        pixels = bytes((i // 128 + 17 * i) % 256 for i in range(1024))
        digest = hashlib.sha256(pixels).hexdigest()
        assert result.stdout.decode().strip() == digest
        print("PASS all eight LCD pages, full SHA-256, repaint, busy, geometry, malformed requests and event isolation")


if __name__ == "__main__":
    main()
