"""Actual bounded PWM setters and settings callbacks; mocked stalled SDK.

ASan/UBSan supported through PIXL_SANITIZE=1. Not device timing evidence.
"""
from pathlib import Path
import os
import re
import subprocess
import tempfile
import unittest
from test_hardware_de3_3 import function

TESTS=Path(__file__).resolve().parent
SRC=TESTS.parents[1]/'application/src'

class BacklightBusyTests(unittest.TestCase):
    def test_actual_pwm_bounds_initialization_failure_and_settings_commit(self):
        display=(SRC/'mui/mui_u8g2.c').read_text()
        header=(SRC/'mui/mui_u8g2.h').read_text()
        self.assertIn('ret_code_t mui_u8g2_set_backlight_level',header)
        limit=re.search(r'^#define BACKLIGHT_PWM_MAX_ATTEMPTS \d+u$',display,re.M).group(0)
        parts=[limit]
        parts += [function(display,name) for name in ('backlight_pwm_duty_set',
                    'mui_u8g2_set_backlight_level','mui_u8g2_get_backlight_level','pwm_init')]
        scene=(SRC/'app/settings/scene/settings_scene_lcd_backlight.c').read_text()
        reset=(SRC/'app/settings/scene/settings_scene_main.c').read_text()
        parts += [function(scene,'settings_scene_lcd_backlight_event_cb'),
                  function(reset,'settings_reset_default')]
        code=(TESTS/'backlight_busy_de343.c.in').read_text().replace('@PRODUCTION@','\n'.join(parts))
        with tempfile.TemporaryDirectory(prefix='de343-pwm-') as temp:
            c=Path(temp)/'test.c';exe=Path(temp)/'test'
            c.write_text(code)
            cmd=[os.environ.get('CC','gcc'),'-std=c11','-O1','-g','-Wall','-Wextra','-Werror',str(c),'-o',str(exe)]
            if os.environ.get('PIXL_SANITIZE')=='1':
                cmd+=['-fsanitize=address,undefined','-fno-omit-frame-pointer','-no-pie']
            built=subprocess.run(cmd,capture_output=True,text=True,timeout=30)
            self.assertEqual(built.returncode,0,built.stdout+built.stderr)
            ran=subprocess.run([str(exe)],capture_output=True,text=True,timeout=5)
            self.assertEqual(ran.returncode,0,ran.stdout+ran.stderr)
            self.assertIn('PASS',ran.stdout)
            print(ran.stdout.strip())

if __name__=='__main__':unittest.main()
