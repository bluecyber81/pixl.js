"""Actual C settings UI failure branches: failed saves cannot reboot/exit silently."""
from pathlib import Path
import importlib.util
import unittest

FW = Path(__file__).resolve().parents[2]
SRC = FW / 'application/src/app/settings'
spec = importlib.util.spec_from_file_location('de2_native', FW / 'tests/de2/test_player_v3.py')
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


class SettingsSaveUiTests(native.NativeTests):
    test_real_player_format_and_resource_lifecycle = None
    test_real_central_v3_guard_preserves_destination_and_classic_path = None
    test_real_favorite_sort_null_folder_data_and_antisymmetry = None
    test_real_ui_generation_never_emulates_failed_or_unsupported_tag = None
    test_real_large_category_navigation_matches_visible_100_items = None

    def test_real_reboot_exit_reset_and_forced_exit_error_paths(self):
        main = (SRC / 'scene/settings_scene_main.c').read_text()
        management = (SRC / 'scene/settings_scene_app_management.c').read_text()
        app = (SRC / 'app_settings.c').read_text()
        enum_start = main.index('enum settings_main_menu_t')
        enumeration = main[enum_start:main.index('};', enum_start) + 2]
        reset = native.function(main, 'settings_scene_main_msg_box_reset_settings_cb')
        selected = native.function(main, 'settings_scene_main_list_view_on_selected')
        leave = native.function(management, 'settings_scene_app_management_on_exit')
        kill = native.function(app[app.rfind('\nvoid app_settings_on_kill('):], 'app_settings_on_kill')
        self.compile_run(r'''
#include <assert.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>
#define NRF_SUCCESS 0
#define MUI_LIST_VIEW_EVENT_SELECTED 0
#define INPUT_TYPE_SHORT 2
#define INPUT_TYPE_LONG 3
#define mui_nav_diag_settings(type,selection) ((void)(type),(void)(selection))
#define mui_nav_diag_save_begin(type) ((void)(type))
#define mui_nav_diag_save_result(type,result) ((void)(type),(void)(result))
#define mui_nav_diag_exit_returned(type) ((void)(type))
#define mui_nav_diag_end() ((void)0)
#define _T(x) #x
#define MUI_MSG_BOX_EVENT_SELECT_LEFT 0
#define SETTINGS_VIEW_ID_MAIN 1
#define SETTINGS_VIEW_ID_MSG_BOX 2
#define MINI_APP_ID_SETTINGS 3
#define MUI_LAYER_WINDOW 1
#define MUI_LAYER_TOAST 2
enum {SETTINGS_SCENE_OLED_CONTRAST,SETTINGS_SCENE_VERSION,SETTINGS_SCENE_SLEEP_TIMEOUT,SETTINGS_SCENE_LANGUAGE,SETTINGS_SCENE_STORAGE,SETTINGS_SCENE_APP_MANAGEMENT,SETTINGS_SCENE_ABOUT};
typedef int mui_msg_box_event_t;typedef int mui_list_view_event_t;
typedef struct {void *user_data;} mui_msg_box_t;
typedef struct {void *user_data;} mui_list_view_t;
typedef struct {void *user_data;} mui_list_item_t;
typedef struct {void *p_toast_view,*p_scene_dispatcher,*p_view_dispatcher,*p_view_dispatcher_toast,*p_list_view,*p_progress_bar,*p_msg_box;bool exit_saved;} app_settings_t;
typedef struct {void *p_handle;} mini_app_inst_t;
typedef struct {bool bat_mode,show_mem_usage,hibernate_enabled,anim_enabled,no_sleep_mode,flip_display,swap_buttons;} settings_data_t;
static settings_data_t data;
static int result,save_calls,reset_calls,toast_calls,kills,reboots,resets,reloads,logs,cleanup_calls,dfus;
static int settings_save(void){save_calls++;return result;}
static int settings_reset(void){reset_calls++;return result;}
static settings_data_t *settings_get_data(void){return &data;}
static void mui_toast_view_show(void*p,const char*s){(void)p;(void)s;toast_calls++;}
static void settings_reset_default(void*p){(void)p;resets++;}
static void settings_scene_main_reload(void*p){(void)p;reloads++;}
static void mini_app_launcher_kill(void*p,unsigned id){(void)p;assert(id==MINI_APP_ID_SETTINGS);kills++;}
static void *mini_app_launcher(void){return NULL;}
static void system_reboot(void){reboots++;}
static void go_sleep(void){}
static void enter_dfu(void){dfus++;}
static void mui_scene_dispatcher_next_scene(void*p,unsigned n){(void)p;(void)n;}
static void mui_view_dispatcher_switch_to_view(void*p,unsigned n){(void)p;(void)n;}
static void *mui(void){return NULL;}
static void mui_update_now(void*p){(void)p;}
static void mui_u8g2_set_flip_display(bool b){(void)b;}
#define mui_msg_box_set_header(...) ((void)0)
#define mui_msg_box_set_message(...) ((void)0)
#define mui_msg_box_set_btn_text(...) ((void)0)
#define mui_msg_box_set_btn_focus(...) ((void)0)
#define mui_msg_box_set_event_cb(...) ((void)0)
static void mui_list_view_clear_items(void*p){(void)p;}
static void cleanup(void*p){(void)p;cleanup_calls++;}
#define mui_scene_dispatcher_free cleanup
#define mui_view_dispatcher_free cleanup
#define mui_list_view_free cleanup
#define mui_progress_bar_free cleanup
#define mui_msg_box_free cleanup
#define mui_toast_view_free cleanup
#define mui_mem_free cleanup
static void mui_view_dispatcher_detach(void*p,unsigned n){(void)p;(void)n;}
#define NRF_LOG_WARNING(...) ((void)logs++)
#pragma GCC diagnostic ignored "-Wunused-variable"
#pragma GCC diagnostic ignored "-Wpointer-to-int-cast"
''' + enumeration + '\n' + reset + '\n' + selected + '\n' + leave + '\n' + kill + r'''
int main(void){
 app_settings_t app={0};mui_list_view_t list={&app};mui_list_item_t item={0};mui_msg_box_t box={&app};
 int failures[]={-91,8};
 for(unsigned i=0;i<2;i++){
  result=failures[i];item.user_data=(void*)(uintptr_t)SETTINGS_MAIN_MENU_REBOOT;
  settings_scene_main_list_view_on_selected(0,&list,&item);assert(reboots==0 && kills==0);
  item.user_data=(void*)(uintptr_t)SETTINGS_MAIN_MENU_EXIT;
  settings_scene_main_list_view_on_selected(0,&list,&item);assert(kills==0);
  item.user_data=(void*)(uintptr_t)SETTINGS_MAIN_MENU_DFU;
  settings_scene_main_list_view_on_selected(0,&list,&item);assert(dfus==0);
  settings_scene_main_msg_box_reset_settings_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT,&box);assert(resets==0 && reloads==0);
 }
 assert(save_calls==6 && reset_calls==2 && toast_calls==8);
 result=0;item.user_data=(void*)(uintptr_t)SETTINGS_MAIN_MENU_REBOOT;settings_scene_main_list_view_on_selected(0,&list,&item);assert(reboots==1);
 item.user_data=(void*)(uintptr_t)SETTINGS_MAIN_MENU_EXIT;settings_scene_main_list_view_on_selected(0,&list,&item);assert(kills==1);
 item.user_data=(void*)(uintptr_t)SETTINGS_MAIN_MENU_DFU;settings_scene_main_list_view_on_selected(0,&list,&item);assert(dfus==1);
 settings_scene_main_msg_box_reset_settings_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT,&box);assert(resets==1 && reloads==1);
 settings_scene_main_msg_box_reset_settings_cb(2,&box);assert(reset_calls==3);
 result=-91;settings_scene_app_management_on_exit(&app);assert(toast_calls==9);
 app.exit_saved=false;mini_app_inst_t instance={&app};app_settings_on_kill(&instance);assert(logs==1 && cleanup_calls>0 && instance.p_handle==NULL);
 result=0;instance.p_handle=&app;app_settings_on_kill(&instance);assert(logs==1 && instance.p_handle==NULL);
 puts("PASS: failed save blocks reboot/menu kill/DFU, successful save allows DFU, failed reset has no success, unavoidable exits report errors");return 0;
}
''')


if __name__ == '__main__':
    unittest.main()
