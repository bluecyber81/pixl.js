"""Real input/view/scene/list callback sequence with synthetic player/VFS edges.

No timing claim about electrical switches: BSP event ordering is injected.
--baseline proves the preserved PRESS -> browser -> SHORT -> home regression.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
from root_host import function
from input_context_support import context_state, context_functions, has_context_api, TOKEN_FUNCTIONS

FW = Path(__file__).resolve().parents[2]

PREFIX = r'''
#include <assert.h>
#define mui_nfc_save_input(m,e) false
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "mui_alloc.h"
void *mui_mem_malloc(size_t n){return malloc(n);}
void *mui_mem_realloc(void *p,size_t n){return realloc(p,n);}
void mui_mem_free(void *p){free(p);}
#include "bsp_btn.h"
#include "vfs.h"
#include "vfs_meta.h"
#include "player_format.h"
typedef int mui_canvas_t;
typedef int mui_anim_t;
typedef int app_timer_t;
typedef int *app_timer_id_t;
typedef int mui_layer_t;
#define MUI_LAYER_FULLSCREEN 0
#define MUI_LAYER_WINDOW 1
#define MUI_LAYER_DESKTOP 2
#define MUI_EVENT_ID_INPUT 1
#define BUTTONS_NUMBER 3
#define LIST_ITEM_HEIGHT 14
#define LIST_ANIM_SHORT_TIME 150
#define LIST_ANIM_LONG_TIME 300
#define MINI_APP_ID_PLAYER 7
#define MINI_APP_ID_STATUS_BAR 1
#define MINI_APP_ID_DESKTOP 2
#define PLAYER_VIEW_ID_PLAYER 1
#define PLAYER_VIEW_ID_LIST 0
#define PLAYER_SCENE_FILE_BROWSER 0
#define PLAYER_SCENE_PLAY 1
#define ICON_FOLDER 0xe1d6
#define ICON_FILE 0xe1ed
#define ICON_HOME 0xe1f0
#define ICON_ERROR 0xe1bb
#define _T(x) #x
#define NRF_LOG_DEBUG(...) ((void)0)
static void ble_remote_local_activity(void) {}
'''

STUBS = r'''
typedef struct {mui_view_dispatcher_t *p_view_dispatcher;mui_scene_dispatcher_t *p_scene_dispatcher;
 player_view_t *p_player_view;mui_list_view_t *p_list_view;string_t selected_file;} app_player_t;
typedef struct {bool memory_error,auto_update;} mui_t;
static mui_t core;
static mui_view_port_t viewport;
static struct {bool swap_buttons;} settings;
static unsigned kills,starts,stop_commits,dir_cursor;
static mui_event_t queued[16];static unsigned queued_count;
static void *settings_get_data_unused;
static __typeof__(settings) *settings_get_data(void){return &settings;}
static mui_t *mui(void){return &core;}
static void mui_update(mui_t *m){(void)m;}
static void mui_show_memory_error(mui_t *m){assert(0);}
static void mui_post(mui_t *m,mui_event_t *e){assert(queued_count<16);queued[queued_count++]=*e;}
static mui_view_port_t *mui_find_view_port_enabled(mui_t *m,mui_layer_t layer){return layer==MUI_LAYER_FULLSCREEN && viewport.enabled?&viewport:NULL;}
void mui_view_port_enable_set(mui_view_port_t *v,bool enabled){v->enabled=enabled;}
void mui_view_port_update(mui_view_port_t *v){(void)v;}
static void *mini_app_launcher(void){return NULL;}
static bool mini_app_launcher_input_blocked(void*p){(void)p;return false;}
static void *mini_app_launcher_get_app_handle(void *l,int id){return NULL;}
static void mini_app_launcher_run(void *l,int id){assert(0);}
static void mini_app_launcher_kill(void *l,int id){assert(id==MINI_APP_ID_PLAYER);kills++;}
static bool mui_list_view_anim_enabled(void){return false;}
static void mui_anim_set_time(mui_anim_t *a,unsigned t){}
static void mui_anim_set_values(mui_anim_t *a,int x,int y){}
static void mui_anim_start(mui_anim_t *a){}
static void mui_list_view_start_text_anim(mui_list_view_t *v){}
static void mui_nav_diag_list(unsigned type,uint32_t action,unsigned focus){}
void mui_list_view_add_item(mui_list_view_t *v,uint32_t icon,const char *text,void *data){
 mui_list_item_t *item=mui_list_item_array_push_new(v->items);assert(item);
 item->icon=icon;item->user_data=data;string_init_set_str(item->text,text);string_init(item->sub_text);
}
bool mui_list_view_try_add_item_ext(mui_list_view_t *v,uint32_t icon,const char *text,const char *sub,void *data){
 mui_list_view_add_item(v,icon,text,data);return true;
}
static int open_dir(const char *path,vfs_dir_t *dir){assert(strcmp(path,"/player")==0);dir_cursor=0;return VFS_OK;}
static int read_dir(vfs_dir_t *dir,vfs_obj_t *obj){if(dir_cursor++)return VFS_ERR_EOF;
 memset(obj,0,sizeof(*obj));obj->type=VFS_TYPE_REG;strcpy(obj->name,"synthetic.bin");return VFS_OK;}
static int close_dir(vfs_dir_t *dir){return VFS_OK;}
static vfs_driver_t driver={.open_dir=open_dir,.read_dir=read_dir,.close_dir=close_dir};
vfs_driver_t *vfs_get_driver(vfs_drive_t drive){assert(drive==VFS_DRIVE_EXT);return &driver;}
void vfs_meta_decode(uint8_t *data,uint8_t size,vfs_meta_t *meta){memset(meta,0,sizeof(*meta));}
void player_view_stop(player_view_t *v){if(v->is_playing)stop_commits++;v->is_playing=false;}
bool player_view_play(player_view_t *v,vfs_drive_t drive,const char *path){
 assert(strcmp(path,"/player/synthetic.bin")==0);v->is_playing=true;starts++;return true;}
'''

MAIN = r'''
static void drain(void){
 for(unsigned i=0;i<queued_count;i++)mui_process_input(&core,&queued[i]);
 queued_count=0;
}
static void key(unsigned key,bsp_btn_event_t event){mui_input_on_bsp_btn_event(key,event);drain();}
int main(int argc,char **argv){
 assert(argc==2);const char *mode=argv[1];
 mui_view_dispatcher_t views={0};mui_scene_dispatcher_t scenes={0};
 mui_list_view_t list={0};player_view_t player={0};
 mui_view_t list_view={.user_data=&list,.input_cb=mui_list_view_on_input};
 mui_view_t play_view={.user_data=&player,.input_cb=player_view_on_input,.exit_cb=player_view_on_exit};
 app_player_t app={.p_view_dispatcher=&views,.p_scene_dispatcher=&scenes,.p_list_view=&list,.p_player_view=&player};
 string_init(app.selected_file);mui_list_item_array_init(list.items);
 list.user_data=&app;list.p_view=&list_view;list.canvas_height=64;player.user_data=&app;player.p_view=&play_view;
 viewport.user_data=&views;viewport.input_cb=mui_view_dispatcher_on_input;views.p_view_port=&viewport;
 views.views[0].id=0;views.views[0].view=&list_view;views.views[1].id=1;views.views[1].view=&play_view;views.view_count=2;
 const mui_scene_t defs[]={{0,player_scene_file_browser_on_enter,player_scene_file_browser_on_exit},
                         {1,player_scene_play_on_enter,player_scene_play_on_exit}};
 scenes.p_scene_defines=defs;scenes.scene_num=2;scenes.user_data=&app;
 mui_scene_dispatcher_next_scene(&scenes,PLAYER_SCENE_FILE_BROWSER);
 assert(list.focus_index==0 && mui_list_item_array_size(list.items)==2);
 for(unsigned button=0;button<3;button++){
  list.focus_index=1;assert(views.p_active_view==&list_view);
  key(INPUT_KEY_CENTER,BSP_BTN_EVENT_PRESSED);key(INPUT_KEY_CENTER,BSP_BTN_EVENT_RELEASED);
  assert(views.p_active_view==&list_view && starts==button);
  key(INPUT_KEY_CENTER,BSP_BTN_EVENT_SHORT);
  assert(views.p_active_view==&play_view && player.is_playing && starts==button+1 && kills==0);
  if(strcmp(mode,"short")==0){
   key(INPUT_KEY_CENTER,BSP_BTN_EVENT_PRESSED);
   key(INPUT_KEY_CENTER,BSP_BTN_EVENT_RELEASED);key(INPUT_KEY_CENTER,BSP_BTN_EVENT_SHORT);
   assert(kills==0); /* Baseline: PRESS returned to focus0; SHORT killed player. */
  } else if(strcmp(mode,"nonterminal")==0){
   key(button,BSP_BTN_EVENT_RELEASED);key(button,BSP_BTN_EVENT_REPEAT);key(button,BSP_BTN_EVENT_PRESSED);
   assert(player.is_playing && views.p_active_view==&play_view && stop_commits==button);
   key(button,BSP_BTN_EVENT_RELEASED);assert(player.is_playing);
   key(button,BSP_BTN_EVENT_SHORT);
  } else if(strcmp(mode,"long")==0){
   key(button,BSP_BTN_EVENT_PRESSED);assert(player.is_playing);
   key(button,BSP_BTN_EVENT_LONG);key(button,BSP_BTN_EVENT_RELEASED);
   key(INPUT_KEY_CENTER,BSP_BTN_EVENT_REPEAT); /* No duplicate center selection. */
  } else assert(0);
  assert(!player.is_playing && views.p_active_view==&list_view && scenes.scene_depth==1);
  assert(kills==0 && stop_commits==button+1 && list.focus_index==0);
 }
 /* A subsequent, deliberate press on Hauptmenue must still exit the app. */
 key(INPUT_KEY_CENTER,BSP_BTN_EVENT_PRESSED);key(INPUT_KEY_CENTER,BSP_BTN_EVENT_RELEASED);
 assert(kills==0);key(INPUT_KEY_CENTER,BSP_BTN_EVENT_SHORT);assert(kills==1);
 mui_list_view_clear_items(&list);mui_list_item_array_clear(list.items);string_clear(app.selected_file);
 printf("PASS %s: normal start, one stop, no release abort or second home jump\n",mode);
}
'''


def build(fw, folder, name):
    src = fw / 'application/src'
    def read(path): return (src / path).read_text(encoding='utf-8')
    def header(path): return '\n'.join(line for line in read(path).splitlines() if not line.startswith('#include'))
    input_header = read('mui/mui_input.h')
    code = PREFIX + input_header[input_header.index('typedef enum {'):input_header.index('void mui_input_init')]
    for path in ['mui/mui_view.h', 'mui/mui_view_port.h', 'mui/mui_view_dispatcher.h',
                 'mui/mui_scene_dispatcher.h', 'mui/mui_event.h', 'mui/view/mui_list_view.h',
                 'app/player/view/player_view.h']:
        code += '\n' + header(path)
    code += STUBS
    input_source = read('mui/mui_input.c')
    context_names = (*TOKEN_FUNCTIONS, 'mui_input_context_changed') if has_context_api(input_source) else ()
    if context_names:
        code += '\n' + context_state(gestures=True, source_text=input_source)
        code += context_functions(context_names, source_text=input_source)
    functions = {
        'mui/mui_view.c': ['mui_view_input', 'mui_view_enter', 'mui_view_exit'],
        'mui/mui_view_dispatcher.c': ['mui_view_dispatcher_set_curent_view', 'mui_view_dispatcher_on_input', 'mui_view_dispatcher_switch_to_view'],
        'mui/mui_scene_dispatcher.c': ['mui_scene_dispatcher_next_scene', 'mui_scene_dispatcher_back_scene', 'mui_scene_dispatcher_previous_scene'],
        'mui/view/mui_list_view.c': ['mui_list_view_set_focus', 'mui_list_view_clear_items', 'mui_list_view_set_selected_cb', 'mui_list_view_on_input'],
        'app/player/view/player_view.c': ['player_view_on_input', 'player_view_on_exit'],
        'app/player/scene/player_scene_play.c': ['player_scene_play_event_cb', 'player_scene_play_on_enter', 'player_scene_play_on_exit'],
        'app/player/scene/player_scene_file_browser.c': ['player_scene_file_browser_on_selected', 'player_scene_file_browser_reload_folders', 'player_scene_file_browser_on_enter', 'player_scene_file_browser_on_exit'],
        'mui/mui_core.c': ['mui_process_input'],
        'mui/mui_input.c': ['mui_input_post_event', 'mui_input_on_bsp_btn_event'],
    }
    for path, names in functions.items():
        source = read(path)
        for symbol in names:
            # Start at the definition, never an earlier call/prototype.
            match = re.search(r'^(?:static\s+)?void\s+' + re.escape(symbol) + r'\(', source, re.M)
            assert match, symbol
            code += '\n' + function(source[match.start():], symbol)
    functions['mui/mui_input.c'] = [*context_names, *functions['mui/mui_input.c']]
    code += MAIN
    cfile = folder / (name + '.c'); cfile.write_text(code, encoding='utf-8')
    exe = folder / (name + '.exe')
    command = ['gcc', '-std=c11', '-Wall', '-Wextra', '-Werror', '-Wno-unused-parameter',
               '-Wno-unused-function', '-Wno-unused-variable', '-Wno-pointer-to-int-cast', '-Wno-type-limits', '-Wno-pointer-sign']
    for path in [folder, fw / 'components/mlib', src / 'mui', src / 'mod', src / 'mod/vfs', src / 'app/player/view']:
        command += ['-I', str(path)]
    built = subprocess.run(command + [str(cfile), '-o', str(exe)], capture_output=True, text=True, timeout=60)
    assert built.returncode == 0, built.stdout + built.stderr
    return exe, functions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    report = {'device_access': False, 'hardware_mocked': True, 'cases': []}
    with tempfile.TemporaryDirectory(prefix='pixl-player-input-') as temporary:
        folder = Path(temporary); (folder / 'boards.h').write_text('')
        exe, functions = build(FW, folder, 'candidate')
        for mode in ['short', 'nonterminal', 'long']:
            ran = subprocess.run([str(exe), mode], capture_output=True, text=True, timeout=15)
            report['cases'].append({'mode': mode, 'exit_code': ran.returncode, 'stdout': ran.stdout, 'stderr': ran.stderr})
        if args.baseline:
            old, _ = build(args.baseline.resolve(), folder, 'baseline')
            ran = subprocess.run([str(old), 'short'], capture_output=True, text=True, timeout=15)
            report['negative_control'] = {'exit_code': ran.returncode, 'stdout': ran.stdout, 'stderr': ran.stderr}
            assert ran.returncode != 0 and 'kills==0' in ran.stderr, report['negative_control']
    report['actual_functions'] = functions
    report['source_sha256'] = {path: hashlib.sha256((FW / 'application/src' / path).read_bytes()).hexdigest() for path in functions}
    report['passed'] = all(case['exit_code'] == 0 for case in report['cases'])
    if args.report: args.report.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    assert report['passed'], report
    print(json.dumps(report, indent=2))


if __name__ == '__main__': main()
