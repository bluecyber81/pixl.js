"""RAM diagnostic wire/lifecycle and actual queue boundary tests; no device I/O."""
from pathlib import Path
import os
import re
import shutil
import subprocess
import tempfile
import unittest

FW = Path(__file__).resolve().parents[2]
SRC = FW / 'application/src'

PREAMBLE = r'''
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>
#include <stdio.h>
static unsigned critical_depth;
static void app_util_critical_region_enter(uint8_t *nested) {
    *nested = critical_depth != 0; critical_depth++;
}
static void app_util_critical_region_exit(uint8_t nested) {
    assert(critical_depth); critical_depth--;
    assert((critical_depth != 0) == (nested != 0));
}
static uint16_t get16(const uint8_t *p) { return p[0] | ((uint16_t)p[1] << 8); }
static uint32_t get32(const uint8_t *p) {
    return p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}
'''


class NavDiagnosticTests(unittest.TestCase):
    def compile_run(self, body, queue=False):
        cc = os.environ.get('CC') or shutil.which('gcc')
        if not cc:
            raise RuntimeError('An existing C compiler is required')
        with tempfile.TemporaryDirectory(prefix='pixl-nav-diag-') as temporary:
            folder = Path(temporary)
            (folder / 'app_util_platform.h').write_text('#pragma once\n')
            for name in ('mui_nav_diag.c', 'mui_nav_diag.h'):
                (folder / name).write_bytes((SRC / 'mui' / name).read_bytes())
            code = PREAMBLE + '\n#include "mui_nav_diag.c"\n'
            if queue:
                for name in ('mui_event.c', 'mui_event.h'):
                    (folder / name).write_bytes((SRC / 'mui' / name).read_bytes())
                (folder / 'nrf_log.h').write_text('#define NRF_LOG_WARNING(...) ((void)0)\n')
                (folder / 'mui_common.h').write_text('''#pragma once
#define MUI_EVENT_ID_REDRAW 0
#define MUI_EVENT_ID_INPUT 1
#define MUI_EVENT_ID_ANIM 2
#define mui_mem_malloc malloc
#define mui_mem_free free
''')
                code += '\n#include "mui_event.c"\n'
            source = folder / 'test.c'
            source.write_text(code + body, encoding='utf-8')
            binary = folder / ('test.exe' if os.name == 'nt' else 'test')
            command = [cc, '-std=c11', '-O1', '-Wall', '-Wextra', '-Werror',
                       '-Wno-unused-function', '-I', str(folder), str(source), '-o', str(binary)]
            if os.environ.get('UI_SANITIZE') == '1':
                command += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer']
            subprocess.run(command, check=True, timeout=60)
            subprocess.run([str(binary)], check=True, timeout=30)

    def test_wire_bounds_lifecycle_separate_attempts_and_inactive_capture(self):
        self.compile_run(r'''
int main(void) {
 uint8_t out[106], original[106]; memset(out,0xA7,sizeof(out)); memcpy(original,out,sizeof(out));
 assert(!mui_nav_diag_snapshot(NULL,104));
 for(unsigned n=0;n<104;n++) { assert(!mui_nav_diag_snapshot(out,n)); assert(!memcmp(out,original,sizeof(out))); }
 assert(mui_nav_diag_snapshot(out,104)); assert(!memcmp(out,"UIDG",4)); assert(out[4]==1 && out[5]==0);
 assert(get32(out+76)==0x80000000u && get32(out+92)==0x80000000u);
 assert(out[104]==0xA7 && out[105]==0xA7);
 mui_nav_diag_begin();
 mui_nav_diag_raw(1,0); mui_nav_diag_raw(1,1); mui_nav_diag_raw(1,2);
 mui_nav_diag_raw(0,2); mui_nav_diag_raw(2,2); mui_nav_diag_raw(3,0); mui_nav_diag_raw(0,5);
 mui_nav_diag_post(1,2,true,3); mui_nav_diag_post(1,2,false,64); mui_nav_diag_deliver(1,2);
 mui_nav_diag_post(0,2,true,250); mui_nav_diag_deliver(2,2); /* Side keys do not alter center counters. */
 mui_nav_diag_list(2,19,20); mui_nav_diag_settings(2,19); mui_nav_diag_save_begin(2);
 mui_nav_diag_save_result(2,-91); mui_nav_diag_exit_returned(2); /* Failure must remain stage 5. */
 mui_nav_diag_list(3,19,20); mui_nav_diag_settings(3,19); mui_nav_diag_save_begin(3);
 mui_nav_diag_save_result(3,0); mui_nav_diag_end(); mui_nav_diag_exit_returned(3);
 assert(mui_nav_diag_snapshot(out,104)); assert(out[5]==0 && get16(out+6)==1);
 assert(get16(out+8+2*(1*5+2))==1 && get16(out+12)==1 && get16(out+32)==1);
 assert(get16(out+42)==1 && get16(out+52)==1 && get16(out+62)==1 && out[68]==64);
 assert(get32(out+72)==19 && (int32_t)get32(out+76)==-91 && get16(out+80)==1 && get16(out+82)==20 && out[84]==5);
 assert(get32(out+88)==19 && get32(out+92)==0 && get16(out+96)==1 && get16(out+98)==20 && out[100]==6);
 assert(out[69]==0 && out[70]==0 && out[71]==0 && out[85]==0 && out[86]==0 && out[87]==0 && out[101]==0 && out[102]==0 && out[103]==0);
 memcpy(original,out,104);
 mui_nav_diag_raw(1,2); mui_nav_diag_post(1,2,true,64); mui_nav_diag_deliver(1,2);
 mui_nav_diag_list(2,999,3); mui_nav_diag_settings(2,999); mui_nav_diag_save_begin(2); mui_nav_diag_save_result(2,0);
 assert(mui_nav_diag_snapshot(out,104) && !memcmp(out,original,104));
 /* Nested hook/snapshot calls preserve the caller's IRQ nesting state. */
 uint8_t nesting; app_util_critical_region_enter(&nesting); mui_nav_diag_begin();
 mui_nav_diag_raw(1,2); assert(mui_nav_diag_snapshot(out,104)); assert(critical_depth==1);
 app_util_critical_region_exit(nesting);
 assert(get16(out+6)==2 && get16(out+22)==1 && out[5]==1 && get16(out+80)==0 && get16(out+96)==0);
 for(unsigned i=0;i<70000;i++) { mui_nav_diag_raw(1,2); mui_nav_diag_post(1,2,true,1); mui_nav_diag_deliver(1,2); mui_nav_diag_list(2,19,20); }
 assert(mui_nav_diag_snapshot(out,104));
 assert(get16(out+22)==65535 && get16(out+42)==65535 && get16(out+62)==65535 && get16(out+80)==65535);
 assert(sizeof(state)==96 && !critical_depth);
 puts("PASS RAM navigation wire, bounds, attempt isolation, session reset, inactivity, nesting, saturation");
}
''')

    def test_actual_queue_observes_release_short_drop_and_success_without_reordering(self):
        self.compile_run(r'''
static unsigned received, short_received, release_received;
static void consume(void *ctx,mui_event_t *event) {
 (void)ctx; assert(critical_depth==0); received++;
 if(event->id==MUI_EVENT_ID_INPUT) {
   if(event->arg_int==0x101) release_received++;
   if(event->arg_int==0x201) short_received++;
 }
}
int main(void) {
 mui_event_queue_t q={0}; uint8_t out[104]; assert(mui_event_queue_init(&q));
 mui_event_set_callback(&q,consume,NULL); mui_nav_diag_begin();
 mui_event_t tick={.id=MUI_EVENT_ID_ANIM},release={.id=MUI_EVENT_ID_INPUT,.arg_int=0x101},short_press={.id=MUI_EVENT_ID_INPUT,.arg_int=0x201};
 for(unsigned i=0;i<63;i++) mui_event_post(&q,&tick);
 mui_event_post(&q,&release); mui_event_post(&q,&short_press);
 assert(q.count==64); mui_event_dispatch(&q);
 assert(received==64 && release_received==1 && short_received==0 && q.count==0);
 assert(mui_nav_diag_snapshot(out,sizeof(out)));
 assert(get16(out+40)==1 && get16(out+42)==0 && get16(out+52)==1 && get16(out+60)==1 && get16(out+62)==0 && out[68]==64);
 mui_event_post(&q,&short_press); mui_event_dispatch(&q);
 assert(short_received==1 && received==65);
 assert(mui_nav_diag_snapshot(out,sizeof(out)) && get16(out+42)==1 && get16(out+62)==1);
 mui_nav_diag_end(); mui_event_post(&q,&short_press); mui_event_dispatch(&q);
 assert(short_received==2); assert(mui_nav_diag_snapshot(out,sizeof(out)) && get16(out+42)==1 && get16(out+62)==1);
 mui_event_queue_deinit(&q); assert(!critical_depth);
 puts("PASS actual queue preserves delivery and observes release/short capacity boundary");
}
''', queue=True)

    def test_actual_settings_short_and_long_exit_callbacks_report_save_and_kill(self):
        # Reuse the real-callback fixture and replace only its hardware stand-ins:
        # the Settings selection and kill functions remain current source text.
        from test_settings_save_ui import SettingsSaveUiTests
        captured = []
        fixture = SettingsSaveUiTests('test_real_reboot_exit_reset_and_forced_exit_error_paths')
        fixture.compile_run = captured.append
        fixture.test_real_reboot_exit_reset_and_forced_exit_error_paths()
        code = captured[0].split('int main(void){', 1)[0]
        code = re.sub(r'^#define mui_nav_diag_.*\n', '', code, flags=re.M)
        old = 'static void mini_app_launcher_kill(void*p,unsigned id){(void)p;assert(id==MINI_APP_ID_SETTINGS);kills++;}'
        new = '''void app_settings_on_kill(mini_app_inst_t *);
static mini_app_inst_t *active_settings;
static void mini_app_launcher_kill(void*p,unsigned id){
 (void)p; assert(id==MINI_APP_ID_SETTINGS); kills++;
 app_settings_on_kill(active_settings);
}'''
        self.assertIn(old, code)
        code = code.replace(old, new)
        self.compile_run(code + r'''
int main(void) {
 app_settings_t app={0}; mui_list_view_t list={&app};
 mui_list_item_t item={(void*)(uintptr_t)SETTINGS_MAIN_MENU_EXIT};
 mini_app_inst_t instance={&app}; active_settings=&instance; uint8_t out[104];
 mui_nav_diag_begin(); mui_nav_diag_list(2,SETTINGS_MAIN_MENU_EXIT,20);
 result=-91; settings_scene_main_list_view_on_selected(0,&list,&item);
 assert(kills==0 && toast_calls==1 && instance.p_handle==&app);
 assert(mui_nav_diag_snapshot(out,104) && out[5]==1 && out[84]==5 && (int32_t)get32(out+76)==-91);
 mui_nav_diag_list(3,SETTINGS_MAIN_MENU_EXIT,20);
 result=0; settings_scene_main_list_view_on_selected(1,&list,&item);
 assert(kills==1 && instance.p_handle==NULL && save_calls==2);
 assert(mui_nav_diag_snapshot(out,104) && out[5]==0 && out[84]==5 && out[100]==6 && get32(out+92)==0);
 assert(get16(out+80)==1 && get16(out+96)==1 && get32(out+72)==SETTINGS_MAIN_MENU_EXIT && get32(out+88)==SETTINGS_MAIN_MENU_EXIT);
 /* The actual SHORT handler also reaches Home successfully when saving works. */
 app.exit_saved=false; instance.p_handle=&app; mui_nav_diag_begin(); mui_nav_diag_list(2,SETTINGS_MAIN_MENU_EXIT,20);
 settings_scene_main_list_view_on_selected(0,&list,&item);
 assert(kills==2 && instance.p_handle==NULL && save_calls==3);
 assert(mui_nav_diag_snapshot(out,104) && out[5]==0 && out[84]==6 && get32(out+76)==0 && out[100]==0);
 assert(!critical_depth);
 puts("PASS actual Settings SHORT/LONG callbacks preserve save failures and capture completed exit");
}
''')


if __name__ == '__main__':
    unittest.main()
