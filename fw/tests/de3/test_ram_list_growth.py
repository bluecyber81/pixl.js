"""Checked list/filename growth with actual Mlib/TLSF, optional ARM32 QEMU."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest
from root_host import FW, SRC, HostTests, function


class RamListGrowthTests(HostTests):
    def test_memory_overlay_defers_app_destruction_until_next_center_short(self):
        browser=(SRC/'app/amiibo/scene/amiibo_scene_file_browser.c').read_text()
        core=(SRC/'mui/mui_core.c').read_text()
        self.compile_run(r'''
#include <assert.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
typedef struct {bool memory_error,auto_update;} mui_t;
typedef struct {uint32_t arg_int;} mui_event_t;
typedef struct {unsigned key,type;} mui_input_event_t;
typedef struct viewport viewport_t;
struct viewport {void(*input_cb)(viewport_t*,mui_input_event_t*);};
typedef viewport_t mui_view_port_t;
typedef struct {void *p_list_view;unsigned current_focus_index;} app_amiibo_t;
static mui_t core;
static app_amiibo_t *running;
static unsigned focus_sets,kills,desktop_runs,updates;
static bool entered;
#define NRF_LOG_INFO(...) ((void)0)
#define INPUT_KEY_CENTER 1
#define INPUT_TYPE_SHORT 2
#define INPUT_TYPE_LONG 3
#define MINI_APP_ID_STATUS_BAR 1
#define MINI_APP_ID_DESKTOP 2
#define MUI_LAYER_FULLSCREEN 0
#define MUI_LAYER_WINDOW 1
#define MUI_LAYER_DESKTOP 2
static mui_t *mui(void){return &core;}
static void mui_update(mui_t*m){(void)m;++updates;}
static void *mini_app_launcher(void){return NULL;}
static void *mini_app_launcher_get_app_handle(void*l,unsigned id){(void)l;(void)id;return (void*)1;}
static void mini_app_launcher_run(void*l,unsigned id){
 (void)l;assert(id==MINI_APP_ID_DESKTOP && entered && running);
 ++kills;free(running);running=NULL;++desktop_runs;
}
static mui_view_port_t *mui_find_view_port_enabled(mui_t*m,unsigned layer){(void)m;(void)layer;assert(!"overlay must consume input");return NULL;}
static void amiibo_scene_file_browser_on_selected(void){}
static void mui_list_view_set_selected_cb(void*v,void(*cb)(void)){(void)v;(void)cb;assert(running);}
static void mui_list_view_set_user_data(void*v,void*data){(void)v;assert(data==running);}
static void mui_list_view_set_focus(void*v,unsigned f){(void)v;(void)f;assert(running && !entered);++focus_sets;}
static void amiibo_scene_file_browser_reload_folders(app_amiibo_t*a){assert(a==running);core.memory_error=true;}
''' + function(browser,'amiibo_scene_file_browser_on_enter') + '\n' + function(core,'mui_process_input') + r'''
int main(void){
 for(unsigned i=0;i<100;i++){
  running=calloc(1,sizeof(*running));assert(running);entered=false;
  amiibo_scene_file_browser_on_enter(running);
  assert(running && focus_sets==i+1 && kills==i);entered=true;
  mui_event_t e={.arg_int=INPUT_KEY_CENTER|(INPUT_TYPE_LONG<<8)};
  mui_process_input(&core,&e);assert(running && core.memory_error && kills==i);
  e.arg_int=0|(INPUT_TYPE_SHORT<<8);mui_process_input(&core,&e);assert(running && core.memory_error);
  e.arg_int=INPUT_KEY_CENTER|(INPUT_TYPE_SHORT<<8);mui_process_input(&core,&e);
  assert(!running && !core.memory_error && kills==i+1 && desktop_runs==i+1);
 }
 puts("PASS allocation-free overlay: on_enter completes before deferred app destruction; center SHORT recovers");
}
''')

    def test_actual_mlib_tlsf_growth_and_failure_cleanup(self):
        source=(SRC/'mui/view/mui_list_view.c').read_text()
        header=(SRC/'mui/view/mui_list_view.h').read_text()
        browser=(SRC/'app/amiibo/scene/amiibo_scene_file_browser.c').read_text()
        detail=(SRC/'app/amiibo/scene/amiibo_scene_amiibo_detail.c').read_text()
        # Extract at definitions: calls/prototypes may appear first.
        def definition(text,name,result):
            token=result+' '+name+'('
            return function(text[text.index(token):],name)
        replacements={
            'ITEM_DEFINITION':header[header.index('struct mui_list_item_s {'):header.index('#define LIST_SCROLL_UP')],
            'CLEAR_ITEMS':definition(source,'mui_list_view_clear_items','void'),
            'TRY_APPEND':definition(source,'mui_list_view_try_add_item_ext','bool'),
            'SORT_ITEMS':definition(source,'mui_list_view_sort','void'),
            'BROWSER_COMPARE':function(browser,'amiibo_scene_file_browser_list_item_cmp'),
            'BROWSER_RELOAD':function(browser,'amiibo_scene_file_browser_reload_folders'),
            'DETAIL_COMPARE':function(detail,'amiibo_scene_amiibo_detail_list_item_cmp'),
            'DETAIL_RELOAD':function(detail[detail.index('static bool amiibo_scene_amiibo_detail_reload_files(app_amiibo_t *app) {'):],'amiibo_scene_amiibo_detail_reload_files'),
            'BROWSER_SELECTED':function(browser,'amiibo_scene_file_browser_on_selected'),
            'DETAIL_EVENT':function(detail,'app_amiibo_detail_view_on_event'),
        }
        code=Path(__file__).with_name('ram_list_growth.c.in').read_text()
        for key,value in replacements.items():code=code.replace('@'+key+'@',value)
        arm=os.environ.get('PIXL_RAM_ARM32')=='1'
        with tempfile.TemporaryDirectory(prefix='pixl-ram-') as temp:
            folder=Path(temp);path=folder/'test.c';path.write_text(code);binary=folder/('test.arm' if arm else 'test.exe')
            cmd=[shutil.which('gcc'),'-std=c11','-O0','-Wall','-Wextra','-Werror','-Wno-unused-function','-Wno-unused-parameter','-Wno-pointer-to-int-cast',
                 '-I',str(SRC/'mui'),'-I',str(FW/'components/mlib'),'-I',str(FW/'components/tlsf'),str(path),str(FW/'components/tlsf/tlsf.c'),'-o',str(binary)]
            def linux_path(p):
                p=str(p).replace('\\','/')
                return '/mnt/'+p[0].lower()+p[2:] if p[1:3]==':/' else p
            if arm:cmd=['wsl.exe','-d','Ubuntu-24.04-Codex-New','--','arm-linux-gnueabihf-gcc']+[linux_path(p) for p in cmd[1:]]
            built=subprocess.run(cmd,capture_output=True,text=True,timeout=60)
            self.assertEqual(built.returncode,0,built.stdout+built.stderr)
            run=['wsl.exe','-d','Ubuntu-24.04-Codex-New','--','qemu-arm','-L','/usr/arm-linux-gnueabihf',linux_path(binary)] if arm else [str(binary)]
            ran=subprocess.run(run,capture_output=True,text=True,timeout=60)
            self.assertEqual(ran.returncode,0,ran.stdout+ran.stderr)
            self.assertIn('PASS',ran.stdout)
            print(ran.stdout.strip())


if __name__=='__main__':unittest.main()
