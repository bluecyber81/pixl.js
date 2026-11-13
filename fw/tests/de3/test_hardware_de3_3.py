"""Actual-source DE3.3 button ownership and SDK ADC-timeout regression tests.
No device access. PIXL_SANITIZE=1 enables host ASan/UBSan.
"""
from pathlib import Path
import hashlib, json, os, re, subprocess, tempfile
from input_context_support import context_state, context_functions, TOKEN_FUNCTIONS

TESTS = Path(__file__).resolve().parent
SRC = TESTS.parents[1]/'application/src'

def function(text, name):
    m=re.search(r'^[\w \*]+\b'+re.escape(name)+r'\([^;]*?\)\s*\{',text,re.M)
    assert m, name
    begin=text.index('{',m.start()); end=begin+1; depth=1
    while depth:
        if text[end]=='{':depth+=1
        elif text[end]=='}':depth-=1
        end+=1
    return text[m.start():end]

def main():
    pins=json.loads((TESTS/'hardware_fixture/sdk_pins.json').read_text(encoding='utf-8'))
    assert hashlib.sha256((TESTS/'hardware_fixture/pinned_app_button.c').read_bytes()).hexdigest()==pins['pinned_app_button.c']
    adc_fixture=(TESTS/'adc_timeout_host.c').read_text(encoding='utf-8')
    assert hashlib.sha256(function(adc_fixture,'nrfx_saadc_sample_convert').encode()).hexdigest()==pins['nrfx_saadc_sample_convert_normalized_function_sha256']
    with tempfile.TemporaryDirectory(prefix='pixl-de3-3-hardware-') as tmp:
        folder=Path(tmp)
        (folder/'mui_nav_diag.h').write_text('#pragma once\n#define mui_nav_diag_raw(key,type) ((void)(key),(void)(type))\n',encoding='utf-8')
        for name in ('app_button.h','app_timer.h','bsp.h','nrf_log.h','nrf_pwr_mgmt.h',
                     'app_error.h','boards.h','nrf_drv_saadc.h','nrf_gpio.h','settings.h','nrf_drv_gpiote.h',
                     'sdk_common.h','nrf_assert.h'):
            (folder/name).write_text('#pragma once\n',encoding='utf-8')
        code=(TESTS/'button_independent_host.c').read_text(encoding='utf-8')
        code=code.replace('/* ACTUAL_BUTTON_INCLUDE */','#include "'+(SRC/'mod/bsp_btn.c').as_posix()+'"')
        input_source=(SRC/'mui/mui_input.c').read_text(encoding='utf-8')
        code=code.replace('/* ACTUAL_INPUT_CONTEXT */',context_state(gestures=True,source_text=input_source)+context_functions((*TOKEN_FUNCTIONS,'mui_input_context_changed'),source_text=input_source))
        code=code.replace('/* ACTUAL_INPUT_MAPPER */','static void ble_remote_local_activity(void) {}\n'+function(input_source,'mui_input_post_event')+'\n'+function(input_source,'mui_input_on_bsp_btn_event'))
        code=code.replace('/* ACTUAL_GAME_INPUT */',function((SRC/'app/game/view/game_view.c').read_text(encoding='utf-8'),'game_view_on_input'))
        code=code.replace('/* ACTUAL_INPUT_DEINIT */',function((SRC/'mui/mui_input.c').read_text(encoding='utf-8'),'mui_input_deinit'))
        code=code.replace('/* ACTUAL_MUI_DEINIT */',function((SRC/'mui/mui_core.c').read_text(encoding='utf-8'),'mui_deinit'))
        command=[os.environ.get('CC','gcc'),'-std=c11','-O1','-g','-Wall','-Wextra','-Werror',
                 '-Wno-unused-function','-Wno-unused-variable','-Wno-unused-but-set-variable',
                 '-Wno-unused-parameter','-I',str(folder)]
        if os.environ.get('PIXL_SANITIZE')=='1':command+=['-fsanitize=address,undefined','-fno-omit-frame-pointer']
        debounce=(TESTS/'button_sdk_debounce_host.c').read_text(encoding='utf-8')
        # DE3.43 keeps the pinned original as baseline evidence and compiles
        # the narrowly patched production port for current hardware tests.
        debounce=debounce.replace('/* ACTUAL_SDK_BUTTON_INCLUDE */','#include "'+(SRC/'mod/app_button_de343.c').as_posix()+'"')
        debounce=debounce.replace('/* ACTUAL_BUTTON_INCLUDE */','#include "'+(SRC/'mod/bsp_btn.c').as_posix()+'"')
        for name,text in [('buttons',code),('sdk_debounce',debounce),('adc_timeout',adc_fixture.replace('/* ACTUAL_BATTERY_INCLUDE */','#include "'+(SRC/'bat.c').as_posix()+'"'))]:
            cfile=folder/(name+'.c');exe=folder/(name+('.exe' if os.name=='nt' else ''))
            cfile.write_text(text,encoding='utf-8')
            subprocess.run(command+[str(cfile),'-o',str(exe)],check=True,timeout=60)
            subprocess.run([str(exe)],check=True,timeout=30)
    print('PASS DE3.3 hardware regression tests')

if __name__=='__main__':main()
