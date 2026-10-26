"""Actual settings redraw/callbacks: bounded stat I/O, invalidation and failures.

No hardware access. UI drawing and VFS stat are mocked; the cache and both
settings main callback/reload bodies are compiled from the production source.
"""
from pathlib import Path
import unittest

import test_settings_save_ui as fixture_module
from root_host import HostTests

SRC = Path(__file__).resolve().parents[2] / 'application/src'


def harness():
    captured = []
    fixture = fixture_module.SettingsSaveUiTests('test_real_reboot_exit_reset_and_forced_exit_error_paths')
    fixture.compile_run = captured.append
    fixture.test_real_reboot_exit_reset_and_forced_exit_error_paths()
    code = captured[0].split('int main(void){', 1)[0]
    vfs = (SRC / 'mod/vfs/vfs.h').read_text().replace('#include "boards.h"', '')
    snapshot = (SRC / 'app/settings/settings_storage_snapshot.h').read_text().replace('#include "vfs.h"', '')
    snapshot += '\n' + fixture_module.native.function(
        (SRC / 'app/settings/app_settings.c').read_text(), 'settings_storage_snapshot_read')
    code = code.replace('typedef struct {bool valid;} settings_storage_snapshot_t;\n'
                        'static void settings_storage_snapshot_invalidate(settings_storage_snapshot_t*p){p->valid=false;}',
                        vfs + '\n' + snapshot)
    code = code.replace('#include <stdio.h>', '#include <stdio.h>\n#include <string.h>')
    code = code.replace('bool bat_mode,show_mem_usage,hibernate_enabled,anim_enabled,no_sleep_mode,flip_display,swap_buttons;',
                        'bool bat_mode,show_mem_usage,hibernate_enabled,anim_enabled,no_sleep_mode,flip_display,swap_buttons;unsigned language,oled_contrast;')
    code = code.replace('static void settings_scene_main_reload(void*p){(void)p;reloads++;}',
                        'static void settings_scene_main_reload(void*p);')
    code = code.replace(',reloads,', ',')
    code = code.replace('static int settings_save(void){save_calls++;return result;}',
                        'static settings_storage_snapshot_t *observed;\n'
                        'static int settings_save(void){assert(observed&&!observed->valid);save_calls++;return result;}')
    code = code.replace('static int settings_reset(void){reset_calls++;return result;}',
                        'static int settings_reset(void){assert(observed&&!observed->valid);reset_calls++;return result;}')
    extras = r'''
static int stat_calls, stat_result;
static vfs_stat_t current_stat={1,2048,1024};
static int32_t mock_stat(vfs_stat_t*out){stat_calls++;*out=current_stat;return stat_result;}
static vfs_driver_t driver={.stat=mock_stat},other_driver={.stat=mock_stat};
static vfs_driver_t *active_driver=&driver;
vfs_driver_t *vfs_get_default_driver(void){return active_driver;}
static void *version_get(void){return NULL;}
static const char*version_get_version(void*p){(void)p;return "test";}
static const char*getLangDesc(unsigned n){(void)n;return "Deutsch";}
static const char*getLangString(const char*s){return s;}
#define _L_OFF_F "Off"
static int nrf_pwr_mgmt_get_timeout(void){return 180;}
static unsigned mui_list_view_get_focus(void*p){(void)p;return 1;}
static unsigned mui_list_view_get_scroll_offset(void*p){(void)p;return 0;}
static void mui_list_view_set_focus(void*p,unsigned n){(void)p;(void)n;}
static void mui_list_view_set_scroll_offset(void*p,unsigned n){(void)p;(void)n;}
static char storage_text[64];
static void mui_list_view_add_item_ext(void*p,int icon,const char*label,const char*value,void*data){
 (void)p;(void)icon;(void)data;
 if(!strcmp(label,"APP_SET_STORAGE"))snprintf(storage_text,sizeof(storage_text),"%s",value);
}
static void mui_list_view_add_item(void*p,int icon,const char*label,void*data){(void)p;(void)icon;(void)label;(void)data;}
'''
    main = (SRC / 'app/settings/scene/settings_scene_main.c').read_text()
    definition = main[main.rfind('\nstatic void settings_scene_main_reload('):]
    code += extras + fixture_module.native.function(definition, 'settings_scene_main_reload')
    return code + r'''
int main(void){
 app_settings_t app={0};mui_list_view_t list={&app};mui_msg_box_t box={&app};mui_list_item_t item={0};
 app.p_list_view=&list;observed=&app.storage_snapshot;
 settings_scene_main_reload(&app);assert(stat_calls==1&&strstr(storage_text,"50%"));
 const unsigned toggles[]={SETTINGS_MAIN_MENU_LI_MODE,SETTINGS_MAIN_MENU_SHOW_MEM_USAGE,
  SETTINGS_MAIN_MENU_ENABLE_HIBERNATE,SETTINGS_MAIN_MENU_ANIM_ENABLED,SETTINGS_MAIN_MENU_NO_SLEEP,
  SETTINGS_MAIN_MENU_FLIP_DISPLAY,SETTINGS_MAIN_MENU_SWAP_BUTTONS};
 for(unsigned repeat=0;repeat<20;repeat++)for(unsigned i=0;i<sizeof(toggles)/sizeof(*toggles);i++){
  item.user_data=(void*)(uintptr_t)toggles[i];settings_scene_main_list_view_on_selected(0,&list,&item);
  settings_scene_main_reload(&app); /* Ordinary submenu return/redraw. */
 }
 assert(stat_calls==1);
 /* Switching the selected storage driver cannot reuse the previous sample. */
 current_stat.free_bytes=512;active_driver=&other_driver;settings_scene_main_reload(&app);
 assert(stat_calls==2&&strstr(storage_text,"75%"));
 /* Partial error results are discarded, and RAM-only UI redraws don't retry I/O. */
 stat_result=VFS_ERR_FAIL;settings_storage_snapshot_invalidate(observed);settings_scene_main_reload(&app);
 assert(stat_calls==3&&!observed->stat.total_bytes&&strstr(storage_text,"NOT_MOUNTED"));
 settings_scene_main_reload(&app);assert(stat_calls==3);
 stat_result=0;settings_storage_snapshot_invalidate(observed);settings_scene_main_reload(&app);assert(stat_calls==4);
 /* These real callbacks invalidate even when journal/reset writes fail. */
 const unsigned saves[]={SETTINGS_MAIN_MENU_EXIT,SETTINGS_MAIN_MENU_REBOOT,SETTINGS_MAIN_MENU_DFU};
 result=VFS_ERR_FAIL;
 for(unsigned i=0;i<sizeof(saves)/sizeof(*saves);i++){
  assert(observed->valid);item.user_data=(void*)(uintptr_t)saves[i];
  settings_scene_main_list_view_on_selected(0,&list,&item);assert(!observed->valid);
  int old=stat_calls;settings_scene_main_reload(&app);assert(stat_calls==old+1);
 }
 settings_scene_main_msg_box_reset_settings_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT,&box);assert(!observed->valid);
 settings_scene_main_reload(&app);settings_scene_app_management_on_exit(&app);assert(!observed->valid);
 settings_scene_main_reload(&app);
 /* Cancelling reset does not force a new storage traversal. */
 int old=stat_calls;settings_scene_main_msg_box_reset_settings_cb(2,&box);settings_scene_main_reload(&app);assert(stat_calls==old);
 /* A fresh app gets a new snapshot; stale driver/stat errors never survive it. */
 app_settings_t reopened={0};settings_scene_main_reload(&reopened);assert(stat_calls==old+1);
 active_driver=NULL;settings_scene_main_reload(&app);assert(observed->result==VFS_ERR_NODEV&&!observed->stat.avaliable);
 other_driver.stat=NULL;active_driver=&other_driver;settings_scene_main_reload(&app);assert(observed->result==VFS_ERR_NODEV);
 puts("PASS actual settings UI: 140 toggles/280 redraws use one stat; driver/error/mutation/reopen boundaries remain fresh");
}
'''


class SettingsStorageSnapshotTests(HostTests):
    def test_actual_redraw_cost_and_storage_change_boundaries(self):
        self.compile_run(harness())


if __name__ == '__main__':
    unittest.main()
