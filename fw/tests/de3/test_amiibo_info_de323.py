"""Actual info renderer, QR encoder, u8g2 font and input/return-path integration."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest
from root_host import FW,SRC,function


class FigureInfoTests(unittest.TestCase):
    def test_actual_renderer_privacy_layout_and_menu_return(self):
        with tempfile.TemporaryDirectory(prefix='pixl-info-') as tmp:
            folder=Path(tmp)
            for name in ['amiibo_info_draw.c','amiibo_info_draw.h','mui_qrcode_helper.c','mui_qrcode_helper.h']:
                shutil.copyfile(SRC/name,folder/name)
            for name in ['mui_canvas.c','mui_canvas.h','mui_input.h','u8g2_font_wqy12_t_gb2312a.c','u8g2_font_siji_t_6x10.c']:
                shutil.copyfile(SRC/'mui'/name,folder/name)
            shutil.copyfile(SRC/'ntag/ntag_def.h',folder/'ntag_def.h')
            (folder/'mui_common.h').write_text('#include <stdbool.h>\n#include <stdint.h>\n#include <string.h>\n#include "u8g2.h"\n',encoding='utf-8')
            (folder/'bsp.h').write_text('typedef int bsp_event_t;\n',encoding='utf-8')
            (folder/'mui_u8g2.h').write_text('#include "u8g2.h"\n',encoding='utf-8')
            (folder/'amiibo_helper.h').write_text('#include <stdint.h>\nuint32_t to_little_endian_int32(const uint8_t *);\n',encoding='utf-8')
            (folder/'db_header.h').write_text('#pragma once\n#include <stdint.h>\ntypedef struct {int placeholder;} db_amiibo_t;\nconst db_amiibo_t *get_amiibo_by_id(uint32_t,uint32_t);\n',encoding='utf-8')
            (folder/'i18n').mkdir()
            shutil.copyfile(SRC/'i18n/string_id.h',folder/'i18n/string_id.h')
            (folder/'i18n/language.h').write_text('#pragma once\n#include "string_id.h"\nconst char *getLangString(int);\n#define _T(name) getLangString(_L_ ## name)\n',encoding='utf-8')
            template=Path(__file__).with_name('amiibo_info_render.c.in').read_text(encoding='utf-8')
            replacements={
                'ACTUAL_ENDIAN_FUNCTION':function((SRC/'amiibo_helper.c').read_text(encoding='utf-8'),'to_little_endian_int32'),
                'ACTUAL_FILE_BACK_CALLBACK':function((SRC/'app/amiibo/scene/amiibo_scene_amiibo_detail_menu.c').read_text(encoding='utf-8'),'amiibo_scene_figure_info_back'),
                'ACTUAL_FILE_INPUT':function((SRC/'app/amiibo/view/amiibo_detail_view.c').read_text(encoding='utf-8'),'amiibo_detail_view_on_input'),
                'ACTUAL_DB_BACK_CALLBACK':function((SRC/'app/amiidb/scene/amiidb_scene_amiibo_detail_menu.c').read_text(encoding='utf-8'),'amiidb_scene_figure_info_back'),
                'ACTUAL_DB_INPUT':function((SRC/'app/amiidb/view/amiibo_view.c').read_text(encoding='utf-8'),'amiibo_view_on_input'),
                'ACTUAL_DB_QR':function((SRC/'app/amiidb/view/amiibo_view.c').read_text(encoding='utf-8'),'amiibo_view_draw_qrcode'),
            }
            for key,value in replacements.items():template=template.replace('/*'+key+'*/',value)
            (folder/'main.c').write_text(template,encoding='utf-8')
            u8=FW/'components/u8g2/csrc'
            libs=['u8g2_setup.c','u8g2_font.c','u8g2_hvline.c','u8g2_ll_hvline.c',
                  'u8g2_box.c','u8g2_intersection.c','u8g2_line.c','u8g2_kerning.c','u8x8_8x8.c',
                  'u8g2_buffer.c','u8g2_bitmap.c','u8g2_circle.c',
                  'u8x8_setup.c','u8x8_display.c','u8x8_cad.c','u8x8_byte.c','u8x8_gpio.c',
                  'u8x8_capture.c','u8x8_u16toa.c','u8x8_u8toa.c']
            sources=[folder/n for n in ['main.c','amiibo_info_draw.c','mui_qrcode_helper.c','mui_canvas.c','u8g2_font_wqy12_t_gb2312a.c','u8g2_font_siji_t_6x10.c']]
            sources += [SRC/'i18n/de_DE.c',SRC/'i18n/en_US.c',FW/'components/qrcode/c/qrcodegen.c']+[u8/n for n in libs]
            binary=folder/'render.exe'
            cmd=[shutil.which('gcc'),'-std=c11','-O1','-ffunction-sections','-fdata-sections',
                 '-I',str(folder),'-I',str(u8),'-I',str(FW/'components/qrcode/c'),
                 *map(str,sources),'-Wl,--gc-sections','-o',str(binary)]
            built=subprocess.run(cmd,capture_output=True,text=True,timeout=90)
            self.assertEqual(built.returncode,0,built.stdout+built.stderr)
            renders=Path(os.environ.get('PIXL_INFO_RENDER_DIR',str(folder/'renders')))
            renders.mkdir(parents=True,exist_ok=True)
            ran=subprocess.run([str(binary),str(renders)],capture_output=True,text=True,timeout=30)
            self.assertEqual(ran.returncode,0,ran.stdout+ran.stderr)
            self.assertIn('PASS figure-info',ran.stdout)
            self.assertEqual(len(list(renders.glob('*.pbm'))),14)
            print(ran.stdout.strip())


if __name__=='__main__':unittest.main()
