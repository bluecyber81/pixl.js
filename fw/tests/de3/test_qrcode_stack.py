"""Actual QR encoder/render parity and a bounded local helper stack frame."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest

from root_host import FW, SRC


STUB_HEADER = r'''
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "qrcodegen.h"
typedef struct { uint8_t color; uint32_t dots; uint64_t hash; } mui_canvas_t;
uint8_t mui_canvas_get_draw_color(mui_canvas_t *);
void mui_canvas_set_draw_color(mui_canvas_t *, uint8_t);
void mui_canvas_draw_dot(mui_canvas_t *, uint8_t, uint8_t);
uint8_t mui_canvas_get_width(mui_canvas_t *);
uint8_t mui_canvas_get_height(mui_canvas_t *);
bool draw_qrcode(mui_canvas_t *, uint8_t, uint8_t, uint8_t, const char *);
void printQr(const uint8_t *, mui_canvas_t *, uint8_t, uint8_t, uint8_t);
'''


class QrcodeStackTests(unittest.TestCase):
    def prepare(self, folder):
        (folder / 'mui_qrcode_helper.h').write_text(STUB_HEADER)
        # Keep the production helper verbatim; only canvas operations are stubbed.
        helper = folder / 'mui_qrcode_helper.c'
        helper.write_text((SRC / 'mui_qrcode_helper.c').read_text())
        return helper

    def test_actual_encoder_matrix_parity_sizes_and_guard_bytes(self):
        with tempfile.TemporaryDirectory(prefix='pixl-qr-') as tmp:
            folder = Path(tmp)
            helper = self.prepare(folder)
            test = folder / 'test.c'
            test.write_text(Path(__file__).with_name('qrcode_stack.c.in').read_text())
            binary = folder / 'test.exe'
            command = [shutil.which('gcc'), '-std=c11', '-O1', '-Wall', '-Wextra', '-Werror',
                       '-I', str(folder), '-I', str(FW / 'components/qrcode/c'), str(helper),
                       str(test), str(FW / 'components/qrcode/c/qrcodegen.c'), '-o', str(binary)]
            if os.environ.get('PIXL_QR_SANITIZE') == '1':
                command[1:1] = ['-fsanitize=address,undefined', '-fno-omit-frame-pointer']
            built = subprocess.run(command, text=True, capture_output=True, timeout=60)
            self.assertEqual(built.returncode, 0, built.stdout + built.stderr)
            ran = subprocess.run([str(binary)], text=True, capture_output=True, timeout=60)
            self.assertEqual(ran.returncode, 0, ran.stdout + ran.stderr)
            self.assertIn('PASS QR', ran.stdout)
            print(ran.stdout.strip())

    def test_helper_frame_is_bounded(self):
        # Host builds enforce the budget everywhere; the pinned SDK also checks
        # the real Cortex-M4 ABI. This is a per-frame bound, not whole-stack proof.
        compilers = [(shutil.which('gcc'), [])]
        arm = shutil.which('arm-none-eabi-gcc')
        if arm:
            compilers.append((arm, ['-mcpu=cortex-m4', '-mthumb', '-mfloat-abi=hard', '-mfpu=fpv4-sp-d16']))
        with tempfile.TemporaryDirectory(prefix='pixl-qr-stack-') as tmp:
            folder = Path(tmp)
            helper = self.prepare(folder)
            for index, (compiler, flags) in enumerate(compilers):
                obj = folder / ('helper%d.o' % index)
                command = [compiler, '-std=c11', '-Os', '-fstack-usage', '-c', *flags,
                           '-I', str(folder), '-I', str(FW / 'components/qrcode/c'), str(helper), '-o', str(obj)]
                built = subprocess.run(command, text=True, capture_output=True, timeout=60)
                self.assertEqual(built.returncode, 0, built.stdout + built.stderr)
                entries = [line.split('\t') for line in obj.with_suffix('.su').read_text().splitlines()]
                row = next(row for row in entries if row[0].endswith(':draw_qrcode'))
                self.assertIn(row[2], ('static', 'dynamic,bounded'))
                # Canvas-bound checks add register spills on Windows x64 (416B).
                # Preserve the400B Cortex-M4 budget; this is no whole-stack proof.
                budget = 400 if flags else 448
                self.assertLessEqual(int(row[1]), budget, 'draw_qrcode frame exceeds QR stack budget: ' + str(row))
                print('%s draw_qrcode frame=%s bytes (budget %s)' % (Path(compiler).name, row[1], budget))


if __name__ == '__main__':
    unittest.main()
