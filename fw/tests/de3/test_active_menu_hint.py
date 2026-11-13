"""Active-tag hint and middle-button behavior using actual C and u8g2 fonts.

The QR-enabled layout has its separate full-framebuffer regression in
test_amiidb_qr_de325.py. This harness covers the full-width active screen,
synthetic tag/name variants and the standard view's input callback boundaries.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from root_host import FW, SRC, function


class ActiveMenuHintTests(unittest.TestCase):
    def test_actual_active_views_preserve_tag_and_render_reachable_menu_hint(self):
        with tempfile.TemporaryDirectory(prefix='pixl-active-menu-') as tmp:
            work = Path(tmp)
            out = Path(os.environ.get('PIXL_ACTIVE_RENDER_DIR', str(work / 'renders')))
            out.mkdir(parents=True, exist_ok=True)
            files = ['mui_canvas.c', 'mui_canvas.h', 'mui_input.h', 'mui_event.h', 'mui_element.h',
                     'u8g2_font_wqy12_t_gb2312a.c', 'u8g2_font_siji_t_6x10.c',
                     'u8g2_font_likeminecraft_te.c']
            hashes = {}
            for name in files:
                original = SRC / 'mui' / name
                hashes[str(original)] = hashlib.sha256(original.read_bytes()).hexdigest()
                shutil.copyfile(original, work / name)
            (work / 'i18n').mkdir()
            for name in ['language.c', 'language.h', 'language_list.h', 'string_id.h', 'de_DE.c', 'en_US.c']:
                shutil.copyfile(SRC / 'i18n' / name, work / 'i18n' / name)
            shutil.copyfile(SRC / 'ntag/ntag_def.h', work / 'ntag_def.h')
            (work / 'mui_common.h').write_text('#pragma once\n#include <stdbool.h>\n#include <stdint.h>\n#include <string.h>\n#include "u8g2.h"\n')
            (work / 'bsp.h').write_text('typedef int bsp_event_t;\n')
            (work / 'mui_u8g2.h').write_text('#include "u8g2.h"\n')
            functions = []
            for rel, names in [
                ('amiibo_helper.c', ['to_little_endian_int32']),
                ('amiibo_info_draw.c', ['amiibo_active_menu_hint']),
                ('mui/mui_element.c', ['mui_element_text_layout', 'mui_element_text_size',
                                      'mui_element_text_height', 'mui_element_autowrap_text',
                                      'box_glyph', 'mui_element_autowrap_text_box']),
                ('app/amiibo/view/amiibo_detail_view.c', ['amiibo_detail_view_draw_notes', 'amiibo_detail_view_on_draw', 'amiibo_detail_view_on_input']),
                ('app/amiidb/view/amiibo_view.c', ['amiibo_view_desc_max_offset', 'amiibo_view_on_draw', 'amiibo_view_on_input']),
            ]:
                original = SRC / rel
                hashes[str(original)] = hashlib.sha256(original.read_bytes()).hexdigest()
                source = original.read_text()
                functions.extend(function(source, name) for name in names)
            template = Path(__file__).with_name('active_menu_hint.c.in')
            hashes[str(template)] = hashlib.sha256(template.read_bytes()).hexdigest()
            generated = work / 'active_menu_hint.c'
            generated.write_text(template.read_text().replace('/*EXACT_SOURCE_FUNCTIONS*/', '\n'.join(functions)))
            u8 = FW / 'components/u8g2/csrc'
            libs = ['u8g2_setup.c', 'u8g2_font.c', 'u8g2_hvline.c', 'u8g2_ll_hvline.c',
                    'u8g2_box.c', 'u8g2_intersection.c', 'u8g2_line.c', 'u8g2_kerning.c',
                    'u8x8_8x8.c', 'u8g2_buffer.c', 'u8g2_bitmap.c', 'u8g2_circle.c',
                    'u8x8_setup.c', 'u8x8_display.c', 'u8x8_cad.c', 'u8x8_byte.c',
                    'u8x8_gpio.c', 'u8x8_capture.c', 'u8x8_u16toa.c', 'u8x8_u8toa.c']
            sources = [generated] + [work / name for name in files if name.endswith('.c')]
            sources += [work / 'i18n' / name for name in ['language.c', 'de_DE.c', 'en_US.c']]
            sources += [u8 / name for name in libs]
            command = ['gcc', '-std=c11', '-O1', '-fshort-enums', '-DU8G2_USE_LARGE_FONTS',
                       '-ffunction-sections', '-fdata-sections', '-I', str(work), '-I', str(u8),
                       *map(str, sources), '-Wl,--gc-sections', '-o', str(work / 'active_menu_hint')]
            if os.environ.get('PIXL_SANITIZE') == '1':
                command[1:1] = ['-g', '-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-no-pie']
            built = subprocess.run(command, capture_output=True, text=True, timeout=90)
            (out / 'build.log').write_text(built.stdout + built.stderr)
            self.assertEqual(built.returncode, 0, built.stdout + built.stderr)
            result = subprocess.run([str(work / 'active_menu_hint'), str(out)], capture_output=True, text=True, timeout=30)
            (out / 'run.log').write_text(result.stdout + result.stderr)
            (out / 'RESULTS.json').write_text(json.dumps({
                'passed': result.returncode == 0, 'exit_code': result.returncode,
                'stdout': result.stdout, 'stderr': result.stderr, 'source_hashes': hashes,
                'device_access': False, 'fixtures': ['synthetic tag data and database records',
                    'string container represented by C string', 'view callback boundary only',
                    'QR, information pages and animation integration covered in separate suite'],
            }, indent=2) + '\n')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            print(result.stdout.strip())


if __name__ == '__main__':
    unittest.main()
