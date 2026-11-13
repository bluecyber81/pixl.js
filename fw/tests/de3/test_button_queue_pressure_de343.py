"""Real button-to-list path and bounded queue pressure/IRQ regression tests.

An optional PIXL_BUTTON_SOURCE selects the frozen predecessor for a failing
regression witness. No device access. Queue capacity and input order stay fixed.
"""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from root_host import function
from input_context_support import context_state, context_functions, has_context_api, TOKEN_FUNCTIONS

FW = Path(os.environ.get('PIXL_BUTTON_SOURCE', Path(__file__).resolve().parents[2]))
SRC = FW/'application/src'
ORDER = [('mui/mui_input.c','mui_input_post_event'),('mui/mui_input.c','mui_input_on_bsp_btn_event'),
         ('mui/view/mui_list_view.c','mui_list_view_on_input'),('mui/mui_view.c','mui_view_input'),
         ('mui/mui_view_dispatcher.c','mui_view_dispatcher_on_input'),('mui/mui_core.c','mui_find_view_port_enabled'),
         ('mui/mui_core.c','mui_process_input'),('mui/mui_anim.c','mui_anim_tick_tmr_cb')]


class ButtonQueuePressureTests(unittest.TestCase):
    def test_actual_input_pipeline_and_all_ring_pressure_positions(self):
        inputs = {p for p,_ in ORDER}|{'mui/mui_input.h','mod/bsp_btn.h','mui/mui_event.c','mui/mui_event.h','mui/mui_nav_diag.c','mui/mui_nav_diag.h'}
        snapshot = lambda:{p:hashlib.sha256((SRC/p).read_bytes()).hexdigest() for p in sorted(inputs)}
        before = snapshot()
        fixture = Path(__file__).with_name('button_queue_pressure_de343.c.in')
        input_source = (SRC/'mui/mui_input.c').read_text()
        context_code = ''
        if has_context_api(input_source):
            context_code = '#define TEST_HAS_INPUT_CONTEXT 1\n'
            context_code += context_state(gestures=True, source_text=input_source)
            context_code += context_functions((*TOKEN_FUNCTIONS, 'mui_input_context_changed'), source_text=input_source)
        code = fixture.read_text().replace('@FUNCTIONS@','static void ble_remote_local_activity(void) {}\n'+context_code+'\n'.join(function((SRC/p).read_text(),n) for p,n in ORDER))
        arm = os.environ.get('PIXL_ARM32') == '1'
        sanitizer = os.environ.get('PIXL_SANITIZE') == '1' and not arm
        with tempfile.TemporaryDirectory(prefix='button-pressure-') as temporary:
            folder = Path(temporary)
            for name in ('mui_event.c','mui_event.h','mui_nav_diag.c','mui_nav_diag.h','mui_input.h'):
                (folder/name).write_bytes((SRC/'mui'/name).read_bytes())
            (folder/'bsp_btn.h').write_bytes((SRC/'mod/bsp_btn.h').read_bytes())
            (folder/'bsp.h').write_text('typedef unsigned bsp_event_t;\n')
            (folder/'app_util_platform.h').write_text('#pragma once\n')
            (folder/'nrf_log.h').write_text('#define NRF_LOG_WARNING(...) ((void)0)\n#define NRF_LOG_DEBUG(...) ((void)0)\n')
            (folder/'mui_common.h').write_text('#pragma once\n#include <stdint.h>\n#include <stdbool.h>\n#define MUI_EVENT_ID_REDRAW 0\n#define MUI_EVENT_ID_INPUT 1\n#define MUI_EVENT_ID_ANIM 2\n#define mui_mem_malloc malloc\n#define mui_mem_free free\n')
            source = folder/'test.c'; source.write_text(code)
            binary = folder/'test.exe'
            compiler = shutil.which('arm-linux-gnueabihf-gcc' if arm else 'gcc')
            self.assertIsNotNone(compiler)
            command = [compiler,'-std=c11','-g','-O1','-fshort-enums','-Wall','-Wextra','-Werror',
                       '-Wno-unused-function','-Wno-unused-parameter','-I',str(folder),str(source),'-o',str(binary)]
            if sanitizer:
                command += ['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer','-no-pie']
            built = subprocess.run(command,capture_output=True,text=True,timeout=60)
            self.assertEqual(built.returncode,0,built.stdout+built.stderr)
            run = ['qemu-arm','-L','/usr/arm-linux-gnueabihf',str(binary)] if arm else [str(binary)]
            result = subprocess.run(run,capture_output=True,text=True,timeout=60)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            self.assertEqual(before,snapshot())
            self.assertIn('PASS',result.stdout)
            print(result.stdout.strip())
            if os.environ.get('PIXL_BUTTON_REPORT'):
                report = {'passed':True,'device_access':False,'sources_unchanged':True,'source_sha256':before,
                          'fixture_sha256':hashlib.sha256(fixture.read_bytes()).hexdigest(),
                          'stdout':result.stdout,'sanitizers':sanitizer,'arm32':arm,
                          'limits':['Synthetic main-loop stalls model continued timer/input producers; no physical I/O timing measurement.',
                                    'GPIO/debounce and rendering are stubs; actual input mapping, ring queue, core/view routing and list handler execute.',
                                    'All-input saturation remains bounded and can reject new input; transient rendering events never evict input.',
                                    'No claim that this is the sole cause of the reported physical button behavior.']}
                Path(os.environ['PIXL_BUTTON_REPORT']).write_text(json.dumps(report,indent=2)+'\n')


if __name__ == '__main__':
    unittest.main()
