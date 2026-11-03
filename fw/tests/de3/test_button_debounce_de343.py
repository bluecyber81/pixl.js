"""Actual SDK/BSP debounce, poll ownership and negative-control regression.

Uses ideal millisecond GPIO/timer mocks, not device timing or measured bounce.
The unchanged SDK is compiled as a deliberate failure witness; a second
control restores the old delay solely in temporary test-source memory.
"""
from pathlib import Path
import hashlib
import os
import shutil
import subprocess
import tempfile
import unittest

TESTS=Path(__file__).resolve().parent
FW=TESTS.parents[1]
SRC=FW/'application/src'

class ButtonDebounceTests(unittest.TestCase):
    def test_actual_sdk_buttons_phases_noise_and_idle_ownership(self):
        original=TESTS/'hardware_fixture/pinned_app_button.c'
        port=SRC/'mod/app_button_de343.c'
        self.assertEqual(hashlib.sha256(original.read_bytes()).hexdigest(),
                         '05113a686885fbbcade6594a382fa6a7567537d66fdbf4933778491dedeba684')
        old='        state_set(pin, value ? BTN_PRESS_DETECTED : BTN_IDLE);\n'
        extra='''        /* A rejected short pulse has no RELEASE event to clear this bit.
         * Drop its polling ownership when debounce returns to IDLE. */
        if (!value)
        {
            CRITICAL_REGION_ENTER();
            m_pin_active &= ~(1ULL << pin);
            CRITICAL_REGION_EXIT();
        }
'''
        self.assertEqual(original.read_text().count(old),1)
        self.assertEqual(port.read_text(),original.read_text().replace(old,old+extra))
        make=(FW/'application/Makefile').read_text()
        self.assertNotIn('$(SDK_ROOT)/components/libraries/button/app_button.c',make)
        self.assertEqual(make.count('$(PROJ_DIR)/mod/app_button_de343.c'),2)
        bsp=SRC/'mod/bsp_btn.c'
        prefix=(TESTS/'button_sdk_debounce_host.c').read_text().split('int main(void){',1)[0]
        body=(TESTS/'button_debounce_de343.c.in').read_text()
        with tempfile.TemporaryDirectory(prefix='de343-buttons-') as tmp:
            folder=Path(tmp)
            for name in ('app_button.h','app_timer.h','bsp.h','nrf_log.h','nrf_pwr_mgmt.h',
                         'app_error.h','boards.h','nrf_drv_gpiote.h','sdk_common.h','nrf_assert.h'):
                (folder/name).write_text('#pragma once\n')
            (folder/'mui_nav_diag.h').write_text('#pragma once\n#define mui_nav_diag_raw(key,type) ((void)(key),(void)(type))\n')
            text=bsp.read_text()
            self.assertEqual(text.count('#define BSP_BUTTON_DETECTION_DELAY_MS (20)'),1)
            previous_delay=folder/'bsp_50ms.c'
            previous_delay.write_text(text.replace('#define BSP_BUTTON_DETECTION_DELAY_MS (20)',
                                                   '#define BSP_BUTTON_DETECTION_DELAY_MS (50)'))
            command=[os.environ.get('CC') or shutil.which('gcc'),'-std=c11','-O1','-g','-Wall','-Wextra','-Werror',
                     '-Wno-unused-function','-Wno-unused-variable','-Wno-unused-parameter','-I',str(folder),'-I',str(bsp.parent)]
            if os.environ.get('PIXL_SANITIZE')=='1':
                command+=['-fsanitize=address,undefined','-fno-omit-frame-pointer','-no-pie']
            for label,sdk,button,arg,witness in (
                ('production',port,bsp,None,None),
                ('sdk_negative_control',original,bsp,'idle','rejected pulse must stop polling'),
                ('delay_negative_control',port,previous_delay,'quick','60ms clean press accepted'),
            ):
                with self.subTest(label=label):
                    code=prefix.replace('/* ACTUAL_SDK_BUTTON_INCLUDE */','#include "'+sdk.as_posix()+'"')
                    code=code.replace('/* ACTUAL_BUTTON_INCLUDE */','#include "'+button.as_posix()+'"')+body
                    c=folder/(label+'.c');exe=folder/(label+('.exe' if os.name=='nt' else ''))
                    c.write_text(code)
                    built=subprocess.run(command+[str(c),'-o',str(exe)],capture_output=True,text=True,timeout=60)
                    self.assertEqual(built.returncode,0,built.stdout+built.stderr)
                    ran=subprocess.run([str(exe)]+([arg] if arg else []),capture_output=True,text=True,timeout=60)
                    if witness:
                        self.assertNotEqual(ran.returncode,0)
                        self.assertIn('FAIL '+witness,ran.stderr)
                        print('PASS '+label+': reproduced '+witness)
                    else:
                        self.assertEqual(ran.returncode,0,ran.stdout+ran.stderr)
                        self.assertIn('PASS',ran.stdout)
                        print(ran.stdout.strip())

if __name__=='__main__':
    unittest.main()
