"""Reset live display state and include search in the existing generation timer."""
from pathlib import Path
import re, unittest
from root_host import SRC, HostTests

ROOT = SRC

def function(path, name):
    text = (ROOT / path).read_text(encoding='utf-8')
    match = re.search(r'(?m)^(?:static\s+)?(?:[\w*]+\s+)+'+name+r'\([^;]*?\)\s*\{', text)
    assert match, name
    start = match.start(); at = text.index('{',match.start()); depth=1
    end=at+1
    while depth:
        if text[end]=='{': depth+=1
        if text[end]=='}': depth-=1
        end+=1
    return text[start:end]

base = '#include <assert.h>\n#include <stdbool.h>\n#include <stdint.h>\n#include <stdio.h>\n#include <string.h>\n'
reset = base + r'''
typedef struct { bool flip_display; unsigned oled_contrast,lcd_backlight,sleep_timeout_sec,language; } settings_data_t;
typedef struct {bool valid;} settings_storage_snapshot_t;
static void settings_storage_snapshot_invalidate(settings_storage_snapshot_t*p){p->valid=false;}
typedef struct { void *p_toast_view,*p_view_dispatcher; settings_storage_snapshot_t storage_snapshot; } app_settings_t;
typedef struct { void *user_data; } mui_msg_box_t;
typedef unsigned mui_msg_box_event_t;
#define MUI_MSG_BOX_EVENT_SELECT_LEFT 0
#define NRF_SUCCESS 0
#define NRF_ERROR_INVALID_STATE 8
#define VFS_OK 0
#define VFS_ERR_NOOBJ -2
#define SETTINGS_FILE_NAME "/settings.bin"
#define LCD_SCREEN
#define APP_SET_RESET_DEFAULT_SUCCESS 1
#define DE3_STORAGE_IO_ERROR 2
#define SETTINGS_VIEW_ID_MAIN 3
#define _T(x) "message"
static settings_data_t m_settings_data,def_settings_data;
static bool m_settings_save_allowed,display_flipped;
static unsigned reloads,view_switches;
typedef struct {bool(*mounted)(void);int(*remove_file)(const char*);} vfs_driver_t;
static bool mounted(void){return true;}
static int remove_file(const char*s){assert(!strcmp(s,SETTINGS_FILE_NAME));return VFS_OK;}
static vfs_driver_t driver={mounted,remove_file};
static vfs_driver_t*vfs_get_default_driver(void){return &driver;}
static settings_data_t*settings_get_data(void){return &m_settings_data;}
static void mui_u8g2_set_contrast_level(unsigned x){(void)x;}
static unsigned mui_u8g2_set_backlight_level(unsigned x){(void)x;return NRF_SUCCESS;}
static void mui_u8g2_set_flip_display(bool x){display_flipped=x;}
static void nrf_pwr_mgmt_set_timeout(unsigned x){(void)x;}
static void setLanguage(unsigned x){(void)x;}
static void mui_toast_view_show(void*a,const char*b){(void)a;(void)b;}
static void settings_scene_main_save_error(app_settings_t *app){(void)app;assert(false);}
static void settings_scene_main_reload(void*a){(void)a;++reloads;}
static void mui_view_dispatcher_switch_to_view(void*a,unsigned x){(void)a;(void)x;++view_switches;}
'''
reset += function('mod/settings.c','settings_reset')+'\n'
reset += function('app/settings/scene/settings_scene_main.c','settings_reset_default')+'\n'
reset += function('app/settings/scene/settings_scene_main.c','settings_scene_main_msg_box_reset_settings_cb')+'\n'
reset += r'''
int main(void){
 app_settings_t app={0};mui_msg_box_t box={&app};
 m_settings_data.flip_display=true;mui_u8g2_set_flip_display(true);
 settings_scene_main_msg_box_reset_settings_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT,&box);
 assert(m_settings_save_allowed && reloads==1 && view_switches==1);
 assert(!m_settings_data.flip_display && !display_flipped);
 puts("PASS reset applies stored display rotation immediately");
}
'''
auto = base+r'''
typedef struct { unsigned prev_scene_id; } app_amiidb_t;
enum {AMIIDB_SCENE_GAME_LIST=1,AMIIDB_SCENE_FAV_LIST=2,AMIIDB_SCENE_AMIIBO_SEARCH=3,AMIIDB_SCENE_DATA_LIST=4,AMIIDB_SCENE_RECENT=5};
static unsigned generations,updates;
static void amiidb_scene_amiibo_game_list_generate(app_amiidb_t*a){(void)a;++generations;}
static void*mui(void){return NULL;}
static void mui_update(void*a){(void)a;++updates;}
'''+function('app/amiidb/scene/amiidb_scene_amiibo_detail.c','ntag_generate_timer_handler')+r'''
int main(void){
 app_amiidb_t a={AMIIDB_SCENE_GAME_LIST};ntag_generate_timer_handler(&a);assert(generations==1);
 a.prev_scene_id=AMIIDB_SCENE_FAV_LIST;ntag_generate_timer_handler(&a);assert(generations==2);
 a.prev_scene_id=AMIIDB_SCENE_AMIIBO_SEARCH;ntag_generate_timer_handler(&a);assert(generations==3 && updates==3);
 a.prev_scene_id=AMIIDB_SCENE_DATA_LIST;ntag_generate_timer_handler(&a);assert(generations==3 && updates==4);
 a.prev_scene_id=99;ntag_generate_timer_handler(&a);assert(generations==3 && updates==5);
 a.prev_scene_id=AMIIDB_SCENE_RECENT;ntag_generate_timer_handler(&a);assert(generations==4 && updates==6);
 puts("PASS game/favorite/search generate; slot and unrelated scenes do not");
}
'''
class UiStateResetTests(HostTests):
    def test_reset_updates_live_display_rotation(self):
        self.compile_run(reset)

    def test_auto_generation_includes_search_and_excludes_slots(self):
        self.compile_run(auto)

if __name__ == '__main__': unittest.main()
