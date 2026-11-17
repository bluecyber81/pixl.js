"""Render the actual LCD diagnostic view and exercise its input boundaries."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest

from root_host import FW, SRC, function
from test_text_input_render_de344 import LIBS


class LCDDeviceTest(unittest.TestCase):
    def test_actual_view_and_framebuffer(self):
        with tempfile.TemporaryDirectory(prefix="allmiibo-lcd-test-") as temporary:
            folder = Path(temporary)
            for name in ("mui_canvas.c", "mui_canvas.h", "mui_event.h", "mui_input.h",
                         "mui_view.h", "mui_defines.h", "mui_conf.h", "u8g2_font_wqy12_t_gb2312a.c"):
                shutil.copyfile(SRC / "mui" / name, folder / name)
            (folder / "bsp.h").write_text("typedef int bsp_event_t;\n")
            (folder / "mui_u8g2.h").write_text('#include "u8g2.h"\n')
            (folder / "mui_common.h").write_text(
                '#pragma once\n#include <stdbool.h>\n#include <stdint.h>\n#include <string.h>\n'
                '#include "u8g2.h"\n#include "mui_conf.h"\n')
            production = (SRC / "app/settings/scene/settings_scene_version.c").read_text(encoding="utf-8")
            callbacks = "\n".join(function(production, name) for name in
                                  ("device_test_draw", "device_test_input", "settings_device_test_open"))
            fixture = Path(__file__).with_name("lcd_device_test.c.in").read_text(encoding="utf-8")
            (folder / "view.c").write_text(fixture.replace("/* PRODUCTION */", callbacks), encoding="utf-8")
            u8 = FW / "components/u8g2/csrc"
            binary = folder / "test.exe"
            command = ["gcc", "-std=c11", "-O1", "-ffunction-sections", "-fdata-sections", "-I", str(folder),
                       "-I", str(u8), "-I", str(SRC), str(folder / "view.c"), str(folder / "mui_canvas.c"),
                       str(folder / "u8g2_font_wqy12_t_gb2312a.c"), *(str(u8 / name) for name in LIBS),
                       "-Wl,--gc-sections", "-o", str(binary)]
            if os.environ.get("PIXL_SANITIZE") == "1":
                command[1:1] = ["-g", "-fsanitize=address,undefined", "-fno-omit-frame-pointer", "-no-pie"]
            subprocess.run(command, check=True, timeout=90)
            subprocess.run([binary], check=True, timeout=15)


if __name__ == "__main__":
    unittest.main()
