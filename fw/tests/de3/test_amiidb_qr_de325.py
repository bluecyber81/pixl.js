"""Actual database view, text wrapper, canvas, font and QR encoder regression."""
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from root_host import FW, SRC, function


class DatabaseQrTests(unittest.TestCase):
    def test_actual_database_qr_layout_and_scrolling(self):
        with tempfile.TemporaryDirectory(prefix='pixl-db-qr-') as tmp:
            folder=Path(tmp)
            copies=['amiibo_info_draw.c','amiibo_info_draw.h','mui_qrcode_helper.c','mui_qrcode_helper.h']
            for name in copies:shutil.copyfile(SRC/name,folder/name)
            for name in ['mui_canvas.c','mui_canvas.h','mui_input.h','mui_element.h','u8g2_font_wqy12_t_gb2312a.c','u8g2_font_siji_t_6x10.c']:
                shutil.copyfile(SRC/'mui'/name,folder/name)
            shutil.copyfile(SRC/'ntag/ntag_def.h',folder/'ntag_def.h')
            shutil.copyfile(SRC/'app/amiidb/view/amiibo_view.h',folder/'amiibo_view.h')
            (folder/'mui_common.h').write_text('#pragma once\n#include <stdbool.h>\n#include <stdint.h>\n#include <string.h>\n#include "u8g2.h"\n')
            (folder/'bsp.h').write_text('typedef int bsp_event_t;\n')
            (folder/'mui_u8g2.h').write_text('#include "u8g2.h"\n')
            (folder/'mui_include.h').write_text('''#pragma once
#include "mui_canvas.h"
#include "mui_input.h"
typedef struct {void *user_data;} mui_view_t;
typedef struct {void *var;void (*exec_cb)(void *,int32_t);int32_t start_value,end_value;uint32_t time;} mui_anim_t;
''')
            (folder/'amiibo_helper.h').write_text('#include <stdint.h>\nuint32_t to_little_endian_int32(const uint8_t *);\n')
            (folder/'db_header.h').write_text('''#pragma once
#include <stdint.h>
typedef struct {const char *name_en,*name_cn;} db_amiibo_t;
typedef struct {const char *note_en,*note_cn;} db_link_t;
const db_amiibo_t *get_amiibo_by_id(uint32_t,uint32_t);
''')
            (folder/'i18n').mkdir()
            shutil.copyfile(SRC/'i18n/string_id.h',folder/'i18n/string_id.h')
            (folder/'i18n/language.h').write_text('#pragma once\n#include "string_id.h"\nconst char *getLangString(int);\n#define _T(name) getLangString(_L_ ## name)\n')
            u8=FW/'components/u8g2/csrc'
            libs=['u8g2_setup.c','u8g2_font.c','u8g2_hvline.c','u8g2_ll_hvline.c','u8g2_box.c',
                  'u8g2_intersection.c','u8g2_line.c','u8g2_kerning.c','u8x8_8x8.c','u8g2_buffer.c',
                  'u8g2_bitmap.c','u8g2_circle.c','u8x8_setup.c','u8x8_display.c','u8x8_cad.c',
                  'u8x8_byte.c','u8x8_gpio.c','u8x8_capture.c','u8x8_u16toa.c','u8x8_u8toa.c']
            common=[folder/n for n in ['amiibo_info_draw.c','mui_qrcode_helper.c','mui_canvas.c',
                                       'u8g2_font_wqy12_t_gb2312a.c','u8g2_font_siji_t_6x10.c']]
            common += [SRC/'i18n/de_DE.c',FW/'components/qrcode/c/qrcodegen.c']+[u8/n for n in libs]
            template=Path(__file__).with_name('amiidb_qr_de325.c.in').read_text(encoding='utf-8')
            view_path=SRC/'app/amiidb/view/amiibo_view.c'
            wrapper_path=SRC/'mui/mui_element.c'
            helper_path=SRC/'amiibo_helper.c'
            replacements={'ACTUAL_ENDIAN_FUNCTION':function(helper_path.read_text(encoding='utf-8'),'to_little_endian_int32'),
                          'ACTUAL_WRAPPER':function(wrapper_path.read_text(encoding='utf-8'),'mui_element_autowrap_text_box')}
            names=['amiibo_view_desc_max_offset','amiibo_view_desc_anim_exec','amiibo_view_stop_desc_anim',
                   'amiibo_view_reset_desc_scroll','amiibo_view_update_desc_anim','amiibo_view_on_draw',
                   'amiibo_view_on_input','amiibo_view_on_enter','amiibo_view_on_exit']
            renders=Path(os.environ.get('PIXL_AMIIDB_RENDER_DIR',str(folder/'renders')))
            renders.mkdir(parents=True,exist_ok=True)
            hashes={str(path):hashlib.sha256(path.read_bytes()).hexdigest() for path in
                    [view_path,wrapper_path,helper_path,*[SRC/n for n in copies],SRC/'mui/mui_canvas.c',
                     SRC/'mui/u8g2_font_wqy12_t_gb2312a.c',SRC/'mui/u8g2_font_siji_t_6x10.c',
                     FW/'components/qrcode/c/qrcodegen.c',Path(__file__),Path(__file__).with_name('amiidb_qr_de325.c.in')]}
            results={'passed':False,'device_access':False,'sources_sha256':hashes,'runs':[],
                     'limits':['Real C rendering and deterministic animation/input callbacks; timer/peripheral integration mocked.',
                               'No physical LCD contrast, motion response or phone-camera scan proof.']}
            baseline=Path(os.environ.get('PIXL_AMIIDB_QR_BASELINE',str(FW.parents[1]/'allmiibo_de324_20261024/fw/application/src/app/amiidb/view/amiibo_view.c')))
            try:
                for label,source_path in [('candidate',view_path),('baseline_de324',baseline)]:
                    if label!='candidate' and not source_path.exists():
                        results['baseline_unavailable']=str(source_path);continue
                    source=source_path.read_text(encoding='utf-8')
                    body=template
                    for key,value in {**replacements,'ACTUAL_DEFINES':'\n'.join(re.findall(r'^#define .*$',source,re.M)),
                                      'ACTUAL_VIEW_FUNCTIONS':'\n'.join(function(source,name) for name in names)}.items():
                        body=body.replace('/*'+key+'*/',value)
                    generated=folder/(label+'.c');generated.write_text(body,encoding='utf-8')
                    binary=folder/(label+'.exe')
                    cmd=[shutil.which('gcc'),'-std=c11','-O1','-DU8G2_USE_LARGE_FONTS','-ffunction-sections','-fdata-sections',
                         '-I',str(folder),'-I',str(u8),'-I',str(FW/'components/qrcode/c'),
                         str(generated),*map(str,common),'-Wl,--gc-sections','-o',str(binary)]
                    if os.environ.get('PIXL_SANITIZE')=='1':
                        cmd[1:1]=['-g','-fsanitize=address,undefined','-fno-omit-frame-pointer','-no-pie']
                    built=subprocess.run(cmd,capture_output=True,text=True,timeout=90)
                    self.assertEqual(built.returncode,0,built.stdout+built.stderr)
                    ran=subprocess.run([str(binary),str(renders),'all' if label=='candidate' else 'negative-offset3'],
                                       capture_output=True,text=True,timeout=90)
                    results['runs'].append({'label':label,'source':str(source_path),
                                            'source_sha256':hashlib.sha256(source_path.read_bytes()).hexdigest(),
                                            'generated_sha256':hashlib.sha256(generated.read_bytes()).hexdigest(),
                                            'exit_code':ran.returncode,'stdout':ran.stdout,'stderr':ran.stderr})
                    self.assertEqual(ran.returncode,0 if label=='candidate' else 71,ran.stdout+ran.stderr)
                    if label=='candidate':self.assertIn('PASS amiidb QR',ran.stdout)
                    else:self.assertIn('CHECK failed',ran.stderr)
                    print(ran.stdout.strip() if ran.returncode==0 else 'PASS DE3.24 negative control: QR pixel comparison fails at offset3')
                for path,digest in hashes.items():self.assertEqual(hashlib.sha256(Path(path).read_bytes()).hexdigest(),digest)
                results['passed']=True
            finally:
                (renders/'RESULTS.json').write_text(json.dumps(results,indent=2),encoding='utf-8')


if __name__=='__main__':unittest.main()
