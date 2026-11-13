"""Real u8g2/font checks for toast measurement, clipping and UTF-8 wrapping.

The production canvas is compiled, and the production layout/draw bodies are
extracted verbatim. Only view/string containers and the display transport are
fixtures. Set PIXL_TOAST_OUTPUT to keep logs/renders. PIXL_TOAST_SOURCE can select
an old source tree for a negative control; PIXL_TOAST_EXPECT_OLD_BUG=1 requires
the known Shadow toast overflow rather than accepting it as a passing fix.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from root_host import FW, function


class ToastLayoutTests(unittest.TestCase):
    def test_actual_font_measurement_and_toast_pixels(self):
        root = Path(os.environ.get('PIXL_TOAST_SOURCE', FW.parent)).resolve()
        src = root / 'fw/application/src'
        u8 = root / 'fw/components/u8g2/csrc'
        output = os.environ.get('PIXL_TOAST_OUTPUT')
        temporary = tempfile.TemporaryDirectory(prefix='pixl-toast-')
        work = Path(output).resolve() if output else Path(temporary.name)
        work.mkdir(parents=True, exist_ok=True)
        source = (src / 'mui/mui_element.c').read_text()
        names = []
        if 'mui_element_text_layout(' in source:
            names += ['mui_element_text_layout', 'mui_element_text_size']
        names += ['mui_element_autowrap_text', 'mui_element_text_height']
        extracted = '\n'.join(function(source, name) for name in names)
        extracted += '\n' + function(
            (src / 'mui/view/mui_toast_view.c').read_text(), 'mui_toast_view_on_draw')
        for name in ['mui_canvas.c', 'mui_canvas.h', 'mui_element.h',
                     'u8g2_font_wqy12_t_gb2312a.c', 'u8g2_font_siji_t_6x10.c']:
            shutil.copy2(src / 'mui' / name, work / name)
        (work / 'mui_common.h').write_text('''#pragma once
#include <stdbool.h>
#include <stdint.h>
#include <string.h>
#include "u8g2.h"
''')
        (work / 'mui_u8g2.h').write_text('#include "u8g2.h"\n')
        template = Path(__file__).with_suffix('.c.in').read_text()
        is_old = os.environ.get('PIXL_TOAST_EXPECT_OLD_BUG') == '1'
        code = template.replace('/*PRODUCTION_FUNCTIONS*/', extracted)
        code = code.replace('/*NEW_LAYOUT*/', '0' if is_old else '1')
        (work / 'toast_layout.c').write_text(code)
        libs = ['u8g2_setup.c', 'u8g2_font.c', 'u8g2_hvline.c', 'u8g2_ll_hvline.c',
                'u8g2_box.c', 'u8g2_intersection.c', 'u8g2_line.c', 'u8g2_kerning.c',
                'u8x8_8x8.c', 'u8g2_buffer.c', 'u8g2_bitmap.c', 'u8g2_circle.c',
                'u8x8_setup.c', 'u8x8_display.c', 'u8x8_cad.c', 'u8x8_byte.c',
                'u8x8_gpio.c', 'u8x8_capture.c', 'u8x8_u16toa.c', 'u8x8_u8toa.c']
        files = [work / name for name in ['toast_layout.c', 'mui_canvas.c',
                 'u8g2_font_wqy12_t_gb2312a.c', 'u8g2_font_siji_t_6x10.c']]
        files += [u8 / name for name in libs]
        command = ['gcc', '-std=c11', '-O1', '-g', '-DU8G2_USE_LARGE_FONTS',
                   '-ffunction-sections', '-fdata-sections', '-I', str(work),
                   '-I', str(u8), *map(str, files), '-Wl,--gc-sections',
                   '-o', str(work / 'toast_layout')]
        if os.environ.get('PIXL_SANITIZE') == '1':
            command[1:1] = ['-fsanitize=address,undefined', '-fno-omit-frame-pointer']
        build = subprocess.run(command, capture_output=True, text=True, timeout=60)
        (work / 'build.log').write_text(build.stdout + build.stderr)
        self.assertEqual(build.returncode, 0, build.stdout + build.stderr)
        run = subprocess.run([str(work / 'toast_layout'), str(work)],
                             capture_output=True, text=True, timeout=60)
        (work / 'run.log').write_text(run.stdout + run.stderr)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertIn('PASS', run.stdout)
        result = {
            'source': str(root), 'old_bug_negative_control': is_old,
            'actual_font_and_canvas': True, 'physical_device': False,
            'exit_code': run.returncode,
            'production_hashes': {
                str(p.relative_to(src)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in [src / 'mui/mui_canvas.c', src / 'mui/mui_element.c',
                          src / 'mui/view/mui_toast_view.c',
                          src / 'mui/u8g2_font_wqy12_t_gb2312a.c']},
            'checks': run.stdout.splitlines(),
        }
        (work / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
        print(run.stdout, end='')
        temporary.cleanup()


if __name__ == '__main__':
    unittest.main()
