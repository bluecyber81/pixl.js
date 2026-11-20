"""Exercise actual message-box layout and input gating with the shipped DE/EN font.

The view, setters and post-LCD-flush fence are production C. Only allocations,
canvas drawing and the physical/remote input boundary are modelled here.
"""
from pathlib import Path
import os
import re
import shutil
import subprocess
import tempfile
import unittest

from root_host import FW, SRC, function
from test_ble_status_de320 import FONT


class MessageBoxActionsTests(unittest.TestCase):
    def test_real_labels_fit_and_new_decisions_require_a_fresh_frame(self):
        header = (SRC / 'mui/view/mui_msg_box.h').read_text()
        view = (SRC / 'mui/view/mui_msg_box.c').read_text()
        strip = lambda s: re.sub(r'^#include[^\n]*\n', '', s, flags=re.M)
        core = (SRC / 'mui/mui_core.c').read_text()
        physical = (SRC / 'mui/mui_input.c').read_text()
        physical_code = '\n'.join(re.search(r'^static[^\n]*\b' + name + r'\b[^\n]*;',
                                             physical, re.M)[0]
                                  for name in ('input_context', 'button_context'))
        physical_code += '\n' + '\n'.join(function(physical, n) for n in (
            'mui_input_context_token', 'mui_input_context_current', 'mui_input_context_changed',
            'mui_input_modal_boundary', 'mui_input_event_is_current', 'mui_input_post_event',
            'mui_input_on_bsp_btn_event'))
        physical_code = physical_code.replace('void mui_input_modal_boundary(',
                                               'void physical_modal_boundary(')
        support = (Path(__file__).with_name('msgbox_actions_de394.c.in')).read_text()
        source = (FONT.split('int main(void)')[0] + support
                  .replace('@HEADER@', strip(header))
                  .replace('@PHYSICAL@', physical_code)
                  .replace('@POST_FRAME@', function(core, 'mui_fence_input_after_frame') + '\n' +
                           function(core, 'mui_buffer_flush'))
                  .replace('@VIEW@', strip(view)))
        with tempfile.TemporaryDirectory(prefix='msgbox-actions-') as directory:
            folder = Path(directory)
            (folder / 'mui_u8g2.h').write_text('#include "u8g2.h"\n')
            shutil.copyfile(SRC / 'mui/u8g2_font_wqy12_t_gb2312a.c', folder / 'font.c')
            (folder / 'test.c').write_text(source, encoding='utf-8')
            u8g2 = FW / 'components/u8g2/csrc'
            command = ['gcc', '-std=c11', '-O1', '-Wall', '-Wextra', '-Werror',
                       '-Wno-unused-parameter', '-Wno-unused-function',
                       '-ffunction-sections', '-fdata-sections', '-Wl,--gc-sections',
                       '-I', str(folder), '-I', str(u8g2), '-I', str(SRC / 'i18n')]
            if os.environ.get('PIXL_SANITIZE') == '1':
                command += ['-g', '-fsanitize=address,undefined', '-fno-omit-frame-pointer']
            command += [str(folder / 'test.c'), str(folder / 'font.c'),
                        str(SRC / 'i18n/de_DE.c'), str(SRC / 'i18n/en_US.c'),
                        *(str(u8g2 / f) for f in ('u8g2_font.c', 'u8x8_8x8.c', 'u8g2_kerning.c')),
                        '-o', str(folder / 'test')]
            built = subprocess.run(command, capture_output=True, text=True, timeout=60)
            self.assertEqual(built.returncode, 0, built.stdout + built.stderr)
            run = subprocess.run([folder / 'test'], capture_output=True, text=True, timeout=20)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            self.assertIn('PASS', run.stdout)
            print(run.stdout, end='')
            # Restore the found regression in an isolated C copy: a progress
            # caption must not advance the physical gesture's input context.
            regressed = source.replace('string_set_str(p_view->message, message);',
                                       'string_set_str(p_view->message, message); p_view->awaiting_frame = true;')
            self.assertNotEqual(regressed, source)
            (folder / 'test.c').write_text(regressed, encoding='utf-8')
            built = subprocess.run(command, capture_output=True, text=True, timeout=60)
            self.assertEqual(built.returncode, 0, built.stdout + built.stderr)
            rejected = subprocess.run([folder / 'test'], capture_output=True, text=True, timeout=20)
            self.assertNotEqual(rejected.returncode, 0, 'Progress-fence regression was not detected')
            self.assertIn('mui_input_context_current()==context', rejected.stderr)
            print('PASS negative control rejects progress updates which swallow Cancel')


if __name__ == '__main__':
    unittest.main()
