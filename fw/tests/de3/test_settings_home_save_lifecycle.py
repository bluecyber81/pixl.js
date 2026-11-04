"""Actual Home callback, launcher/kill and immediate REDRAW; no device access."""
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest

import test_settings_save_ui as fixture_module

native = fixture_module.native

FW = Path(__file__).resolve().parents[2]
SRC = FW / 'application/src'


def harness():
    captured = []
    fixture = fixture_module.SettingsSaveUiTests('test_real_reboot_exit_reset_and_forced_exit_error_paths')
    fixture.compile_run = captured.append
    fixture.test_real_reboot_exit_reset_and_forced_exit_error_paths()
    code = captured[0].split('int main(void){', 1)[0]

    def replace(old, new):
        nonlocal code
        assert old in code, old
        code = code.replace(old, new, 1)

    header = (SRC / 'app/settings/app_settings.h').read_text(encoding='utf-8')
    app_type = re.search(r'typedef struct \{.*?\} app_settings_t;', header, re.S).group()
    replace('#include <stdio.h>', '#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>')
    replace('toast_calls,kills,reboots', 'toast_calls,reboots')
    replace('typedef struct {void *p_toast_view,*p_scene_dispatcher,*p_view_dispatcher,*p_view_dispatcher_toast,*p_list_view,*p_progress_bar,*p_msg_box;bool exit_saved;settings_storage_snapshot_t storage_snapshot;} app_settings_t;',
            'typedef void mui_progress_bar_t, mui_view_dispatcher_t, mui_scene_dispatcher_t, mui_toast_view_t;\n' + app_type)
    inst_header = (SRC / 'core/mini_app_defines.h').read_text(encoding='utf-8')
    inst_types = inst_header[inst_header.index('struct mini_app_inst_s;'):inst_header.rindex('#endif')]
    replace('typedef struct {void *p_handle;} mini_app_inst_t;', 'typedef int xbm_t;\n' + inst_types + r'''
#define MINI_APP_ID_DESKTOP 4
typedef struct {mini_app_inst_t *p_main_app_inst,*instances,*prepared_inst;void*prepared_handle;mini_app_exit_reason_t exit_reason;bool exit_prepared,exit_busy;} mini_app_launcher_t;
static mini_app_launcher_t launcher;
static mini_app_inst_t instance;
static unsigned desktop_runs, frees, active_view, frames, frames_at_save;
static unsigned header_sets, message_sets, button_clears, callback_clears;
static bool ntag_emu_prepare_change(void){return true;}
static void ntag_emu_cancel_change(void){}
static bool home_save;
static char header_text[64]="STALE FORMAT CONFIRM", message_text[64];
static void mini_app_launcher_run(mini_app_launcher_t*l,uint32_t id){
 assert(l==&launcher && id==MINI_APP_ID_DESKTOP && !l->p_main_app_inst);
 desktop_runs++;
}
void app_settings_on_kill(mini_app_inst_t*);
static mini_app_t settings_info={.id=MINI_APP_ID_SETTINGS,.kill_cb=app_settings_on_kill};
''')
    replace('static int settings_save(void){save_calls++;return result;}', r'''
static int settings_save(void){
 save_calls++;
 if(home_save){
  assert(active_view==SETTINGS_VIEW_ID_MSG_BOX && frames==frames_at_save+1);
  assert(!strcmp(header_text,"APP_SET") && !strcmp(message_text,"DE3_STORAGE_WORKING"));
  assert(header_sets==frames && message_sets==frames && button_clears==frames && callback_clears==frames);
  assert(instance.p_handle && !((app_settings_t*)instance.p_handle)->exit_saved);
 }
 return result;
}
''')
    replace('static void mui_toast_view_show(void*p,const char*s){(void)p;(void)s;toast_calls++;}',
            'static void mui_toast_view_show(void*p,const char*s){(void)p;(void)s;assert(active_view==SETTINGS_VIEW_ID_MAIN);toast_calls++;}')
    launcher_src = (SRC / 'core/mini_app_launcher.c').read_text(encoding='utf-8')
    launcher_functions = '\n'.join(native.function(launcher_src, name) for name in
                                  ('mini_app_launcher_input_blocked', 'mini_app_launcher_clear_exit', 'mini_app_launcher_exit_prepared', 'mini_app_launcher_cancel_exit', 'mini_app_launcher_prepare_exit', 'mini_app_launcher_find', 'mini_app_launcher_inst_kill', 'mini_app_launcher_kill'))
    replace('static void mini_app_launcher_kill(void*p,unsigned id){(void)p;assert(id==MINI_APP_ID_SETTINGS);kills++;}', launcher_functions)
    replace('static void *mini_app_launcher(void){return NULL;}',
            'static mini_app_launcher_t *mini_app_launcher(void){return &launcher;}')
    replace('static void mui_view_dispatcher_switch_to_view(void*p,unsigned n){(void)p;(void)n;}',
            'static void mui_view_dispatcher_switch_to_view(void*p,unsigned n){assert(p);active_view=n;}')
    core_src = (SRC / 'mui/mui_core.c').read_text(encoding='utf-8')
    event_src = (SRC / 'mui/mui_event.c').read_text(encoding='utf-8')
    replace('static void *mui(void){return NULL;}\nstatic void mui_update_now(void*p){(void)p;}', r'''
#define MUI_EVENT_ID_REDRAW 1
#define MUI_EVENT_ID_INPUT 2
#define mui_nav_diag_deliver(key,type) ((void)(key),(void)(type))
typedef struct {uint32_t id,arg_int;void*arg_ptr;} mui_event_t;
typedef struct {void(*dispatcher)(void*,mui_event_t*);void*dispatch_context;unsigned count;} mui_event_queue_t;
typedef struct {mui_event_queue_t event_queue;} mui_t;
static void redraw_only(void*ctx,mui_event_t*event){
 assert(ctx==&launcher && event->id==MUI_EVENT_ID_REDRAW);
 assert(active_view==SETTINGS_VIEW_ID_MSG_BOX);frames++;
}
static mui_t core={.event_queue={redraw_only,&launcher,2}};
static mui_t *mui(void){return &core;}
''' + native.function(event_src, 'mui_event_dispatch_now') + '\n' + native.function(core_src, 'mui_update_now'))
    for name, replacement in {
        'header': 'static void mui_msg_box_set_header(void*p,const char*s){assert(p&&s);snprintf(header_text,sizeof(header_text),"%s",s);header_sets++;}',
        'message': 'static void mui_msg_box_set_message(void*p,const char*s){assert(p&&s);snprintf(message_text,sizeof(message_text),"%s",s);message_sets++;}',
        'btn_text': 'static void mui_msg_box_set_btn_text(void*p,const char*l,const char*c,const char*r){assert(p&&!l&&!c&&!r);button_clears++;}',
        'event_cb': 'static void mui_msg_box_set_event_cb(void*p,void(*cb)(mui_msg_box_event_t,mui_msg_box_t*)){assert(p&&!cb);callback_clears++;}',
    }.items():
        replace(f'#define mui_msg_box_set_{name}(...) ((void)0)', replacement)
    replace('static void cleanup(void*p){(void)p;cleanup_calls++;}',
            'static void cleanup(void*p){if(p){frees++;free(p);}cleanup_calls++;}')
    return code + r'''
static void start_settings(void){
 app_settings_t *app=malloc(sizeof(*app));assert(app);memset(app,0,sizeof(*app));
 app->p_list_view=calloc(1,sizeof(*app->p_list_view));
 app->p_msg_box=calloc(1,sizeof(*app->p_msg_box));
 app->p_toast_view=malloc(1);app->p_progress_bar=malloc(1);
 app->p_scene_dispatcher=malloc(1);app->p_view_dispatcher=malloc(1);app->p_view_dispatcher_toast=malloc(1);
 assert(app->p_list_view&&app->p_msg_box&&app->p_toast_view&&app->p_progress_bar&&app->p_scene_dispatcher&&app->p_view_dispatcher&&app->p_view_dispatcher_toast);
 app->p_list_view->user_data=app;app->p_msg_box->user_data=app;
 instance=(mini_app_inst_t){.p_app=&settings_info,.state=APP_STATE_RUNNING,.p_handle=app};
 launcher=(mini_app_launcher_t){.p_main_app_inst=&instance,.instances=&instance};active_view=SETTINGS_VIEW_ID_MAIN;
 strcpy(header_text,"STALE FORMAT CONFIRM");
}
static void select_home(int event){
 app_settings_t *app=instance.p_handle;assert(app);
 mui_list_item_t item={.user_data=(void*)(uintptr_t)SETTINGS_MAIN_MENU_EXIT};
 home_save=true;frames_at_save=frames;
 settings_scene_main_list_view_on_selected(event,app->p_list_view,&item);
 home_save=false;
 /* Real immediate REDRAW must not drain the two pending input events. */
 assert(core.event_queue.count==2);
}
int main(void){
 const int failures[]={-91,8};
 for(unsigned i=0;i<2;i++){
  start_settings();int s=save_calls,t=toast_calls;unsigned d=desktop_runs,f=frees;
  result=failures[i];select_home(0);
  assert(save_calls==s+1&&toast_calls==t+1&&desktop_runs==d&&frees==f);
  assert(instance.p_handle&&instance.state==APP_STATE_RUNNING&&active_view==SETTINGS_VIEW_ID_MAIN);
  assert(!((app_settings_t*)instance.p_handle)->exit_saved);
  /* Same app can retry, and its successful kill must not save a second time. */
  result=0;select_home(0);
  assert(save_calls==s+2&&desktop_runs==d+1&&frees==f+8&&!instance.p_handle);
  assert(instance.state==APP_STATE_KILLED&&!launcher.p_main_app_inst);
 }
 for(int event=0;event<2;event++){
  start_settings();int s=save_calls;unsigned f=frees,d=desktop_runs;
  result=0;select_home(event);
  assert(save_calls==s+1&&frees==f+8&&desktop_runs==d+1&&!instance.p_handle);
 }
 /* External/forced exits have never set exit_saved and retain their fallback. */
 for(unsigned i=0;i<3;i++){
  start_settings();int s=save_calls,l=logs;unsigned f=frees;
  result=i<2?failures[i]:0;
  mini_app_launcher_kill(&launcher,MINI_APP_ID_SETTINGS);
  assert(save_calls==s+1&&logs==l+(result!=0)&&frees==f+8&&!instance.p_handle);
 }
 /* Old null-handle contract is unchanged and remains safe. */
 int s=save_calls;result=0;app_settings_on_kill(&instance);assert(save_calls==s+1);
 puts("PASS: 8 Home/fallback cases; one save, immediate render, failure retry, actual launcher destruction and no queue drain");
}
'''


class HomeSaveLifecycleTests(unittest.TestCase):
    def test_actual_home_save_render_and_kill_lifecycle(self):
        compiler = shutil.which('gcc')
        self.assertIsNotNone(compiler)
        with tempfile.TemporaryDirectory(prefix='de313-settings-home-') as temp:
            cfile = Path(temp) / 'test.c'
            binary = Path(temp) / ('test.exe' if os.name == 'nt' else 'test')
            cfile.write_text(harness(), encoding='utf-8')
            command = [compiler, '-std=c11', '-O1', '-Wall', '-Wextra', '-Werror',
                       '-Wno-unused-parameter', '-Wno-unused-function', str(cfile), '-o', str(binary)]
            if os.environ.get('UI_SANITIZE') == '1':
                command += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
            built = subprocess.run(command, capture_output=True, text=True, timeout=45)
            self.assertEqual(built.returncode, 0, built.stdout + built.stderr)
            run = subprocess.run([str(binary)], capture_output=True, text=True, timeout=15)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            self.assertIn('PASS', run.stdout)

    def test_real_header_guard_allows_repeated_inclusion(self):
        header = (SRC / 'app/settings/app_settings.h').read_text(encoding='utf-8')
        self.assertRegex(header, r'#ifndef APP_SETTINGS_H\s+#define APP_SETTINGS_H')


if __name__ == '__main__':
    unittest.main()
