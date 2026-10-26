"""Compile and run the real player/format and generator guard on the host (gcc).

All VFS, display and timer operations are deterministic host stubs. No NFC keys,
tag dumps, device access, firmware build or installed Python packages are needed.
Run: python -m unittest discover -s fw/tests/de2 -p test_player_v3.py -v
"""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

FW = Path(__file__).resolve().parents[2]
SRC = FW / "application/src"
PLAYER = SRC / "app/player/view"


def function(source, name):
    start = source.index(name + "(")
    start = source.rfind("\n", 0, start) + 1
    brace = source.index("{", start)
    depth = 1
    end = brace + 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    return source[start:end]


STUB_MUI = r'''
#pragma once
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
typedef struct { int width, height; } mui_canvas_t;
typedef enum { INPUT_KEY_LEFT, INPUT_KEY_CENTER, INPUT_KEY_RIGHT } input_key_t;
typedef enum { INPUT_TYPE_PRESS, INPUT_TYPE_RELEASE, INPUT_TYPE_SHORT, INPUT_TYPE_LONG, INPUT_TYPE_REPEAT } input_type_t;
typedef struct { input_key_t key; input_type_t type; } mui_input_event_t;
typedef struct mui_view_s mui_view_t;
struct mui_view_s { void *user_data;
 void (*draw_cb)(mui_view_t*,mui_canvas_t*);
 void (*input_cb)(mui_view_t*,mui_input_event_t*);
 void (*enter_cb)(mui_view_t*); void (*exit_cb)(mui_view_t*); };
static int allocation_fail, allocations, frees, draws;
static void *mui_mem_malloc(size_t n) { if(allocation_fail) return NULL; allocations++; return malloc(n); }
static void mui_mem_free(void *p) { if(p) frees++; free(p); }
static mui_view_t *mui_view_create(void) { return calloc(1,sizeof(mui_view_t)); }
static void mui_view_free(mui_view_t *p) { free(p); }
static void *mui(void) { return NULL; }
static void mui_update(void *p) {(void)p;}
static int mui_canvas_get_width(mui_canvas_t *c) { return c->width; }
static int mui_canvas_get_height(mui_canvas_t *c) { return c->height; }
static void mui_canvas_draw_utf8(mui_canvas_t *c,int x,int y,const char *s) {(void)c;(void)x;(void)y;(void)s;}
static void mui_canvas_draw_xbm(mui_canvas_t *c,int x,int y,int w,int h,const uint8_t *d) {
 assert(x>=0 && y>=0 && w<=c->width && h<=c->height && d); draws++;
}
static void mui_canvas_set_draw_color(mui_canvas_t *c,int x) {(void)c;(void)x;}
static int mui_canvas_get_utf8_width(mui_canvas_t *c,const char *s) {(void)c;return (int)strlen(s);}
static void mui_canvas_draw_box(mui_canvas_t*c,int x,int y,int w,int h) {(void)c;(void)x;(void)y;(void)w;(void)h;}
'''
STUB_TIMER = r'''
#pragma once
#include <stdint.h>
typedef int app_timer_t;
typedef app_timer_t *app_timer_id_t;
#define APP_TIMER_DEF(name) static app_timer_t name##_data; static const app_timer_id_t name = &name##_data
#define APP_TIMER_MODE_REPEATED 1
#define APP_TIMER_TICKS(x) (x)
#define NRF_SUCCESS 0
#define APP_ERROR_CHECK(x) assert((x)==0)
static int timer_error, starts, stops, ticks;
static int app_timer_create(app_timer_id_t const *p,int mode,void(*cb)(void*)) {(void)p;(void)mode;(void)cb;return 0;}
static int app_timer_start(app_timer_id_t p,int interval,void *context) {(void)p;(void)context;starts++;ticks=interval;return timer_error;}
static int app_timer_stop(app_timer_id_t p) {(void)p;stops++;return 0;}
'''
PLAYER_TEST = r'''
#include "player_view.h"
static uint8_t file_data[40976];
static size_t file_size, cursor;
static int read_fail_at, read_calls, close_calls, open_error, stat_error, stop_events;
static int stat_fake(const char *path,vfs_obj_t *obj) {(void)path;obj->size=file_size;obj->type=VFS_TYPE_REG;return stat_error;}
static int open_fake(const char *p,vfs_file_t *f,uint32_t mode) {(void)p;(void)f;assert(mode==VFS_MODE_READONLY);cursor=0;return open_error;}
static int close_fake(vfs_file_t *f) {(void)f;close_calls++;return 0;}
static int read_fake(vfs_file_t *f,void *data,size_t n) {
 (void)f;read_calls++;
 if(read_calls==read_fail_at) return -1;
 if(cursor+n>file_size) n=file_size-cursor;
 memcpy(data,file_data+cursor,n);cursor+=n;return (int)n;
}
static vfs_driver_t driver = {.stat_file=stat_fake,.open_file=open_fake,.close_file=close_fake,.read_file=read_fake};
vfs_driver_t *vfs_get_driver(vfs_drive_t d) {(void)d;return &driver;}
#include "player_view.c"
static void le16(unsigned offset,unsigned value) {file_data[offset]=value;file_data[offset+1]=value>>8;}
static void setup(unsigned width,unsigned height,unsigned count,unsigned fps) {
 memset(file_data,0,sizeof(file_data));
 file_data[0]=0x56;file_data[1]=0x58;file_data[2]=0x49;file_data[3]=0x50;
 le16(4,count);le16(6,fps);le16(8,width);le16(10,height);
 file_size=16+((width+7)/8)*height*count;
 cursor=0;read_calls=0;close_calls=0;read_fail_at=0;open_error=0;stat_error=0;
 timer_error=0;allocation_fail=0;stop_events=0;
}
static void event(player_view_event_t e,player_view_t *p) {(void)p;assert(e==PLAYER_VIEW_EVENT_PLAY_STOPPED);stop_events++;}
int main(void) {
 v_header_t header;size_t bytes=0;
 for(unsigned width=1;width<=128;width++) {
  setup(width,64,2,60);
  assert(player_parse_header(file_data,16,file_size,128,64,&header,&bytes));
  assert(bytes==((width+7)/8)*64);
 }
 setup(128,64,40,10);
 assert(file_size==40976 && player_parse_header(file_data,16,file_size,128,64,&header,&bytes));
 for(unsigned n=0;n<16;n++) assert(!player_parse_header(file_data,n,file_size,128,64,&header,&bytes));
 assert(!player_parse_header(file_data,16,file_size-1,128,64,&header,&bytes));
 assert(!player_parse_header(file_data,16,file_size+1,128,64,&header,&bytes));
 const unsigned fields[]={4,6,8,10};
 for(unsigned i=0;i<4;i++) {setup(128,64,2,10);le16(fields[i],0);assert(!player_parse_header(file_data,16,file_size,128,64,&header,&bytes));}
 setup(128,64,2,61);assert(!player_parse_header(file_data,16,file_size,128,64,&header,&bytes));
 setup(129,64,2,10);assert(!player_parse_header(file_data,16,file_size,128,64,&header,&bytes));
 setup(128,65,2,10);assert(!player_parse_header(file_data,16,file_size,128,64,&header,&bytes));
 setup(128,64,2,10);file_data[12]=1;assert(!player_parse_header(file_data,16,file_size,128,64,&header,&bytes));
 setup(128,64,2,10);file_data[0]=0;assert(!player_parse_header(file_data,16,file_size,128,64,&header,&bytes));

 player_view_t *p=player_view_create();p->event_cb=event;
 mui_canvas_t canvas={128,64};
 setup(9,2,2,10);assert(player_view_play(p,VFS_DRIVE_EXT,"/ok"));assert(p->frame_buffer_size==4 && ticks==100);
 p->p_view->draw_cb(p->p_view,&canvas);assert(p->played_frames==1 && read_calls==2);
 p->p_view->draw_cb(p->p_view,&canvas);assert(p->played_frames==1 && read_calls==2);
 player_view_on_frame_tick(p);p->p_view->draw_cb(p->p_view,&canvas);assert(p->played_frames==2 && read_calls==3);
 player_view_on_frame_tick(p);p->p_view->draw_cb(p->p_view,&canvas);
 assert(!p->is_playing && !p->file_open && !p->frame_buffer && close_calls==1 && stop_events==1 && read_calls==3);
 player_view_stop(p);assert(close_calls==1);
 setup(128,64,2,10);file_size=8;assert(!player_view_play(p,VFS_DRIVE_EXT,"/short"));assert(close_calls==1 && !p->file_open);
 setup(128,64,2,0);assert(!player_view_play(p,VFS_DRIVE_EXT,"/fps0"));assert(close_calls==1 && !p->frame_buffer);
 setup(128,64,2,10);allocation_fail=1;assert(!player_view_play(p,VFS_DRIVE_EXT,"/oom"));assert(close_calls==1 && !p->file_open);
 setup(128,64,2,10);timer_error=7;assert(!player_view_play(p,VFS_DRIVE_EXT,"/timer"));assert(close_calls==1 && !p->frame_buffer && !p->is_playing);
 setup(128,64,2,10);read_fail_at=2;assert(player_view_play(p,VFS_DRIVE_EXT,"/read-error"));p->p_view->draw_cb(p->p_view,&canvas);assert(close_calls==1 && stop_events==1 && !p->frame_buffer);
 setup(128,64,2,10);assert(player_view_play(p,VFS_DRIVE_EXT,"/first"));assert(player_view_play(p,VFS_DRIVE_EXT,"/second"));assert(close_calls==1);p->p_view->exit_cb(p->p_view);assert(close_calls==2);
 setup(128,64,2,10);open_error=-1;assert(!player_view_play(p,VFS_DRIVE_EXT,"/open"));assert(close_calls==0);
 player_view_free(p);assert(allocations==frees);
 puts("PASS: real player format, playback pacing, frame limits and failure cleanup");return 0;
}
'''


class NativeTests(unittest.TestCase):
    def compile_run(self, source, stubs=None, includes=()):
        compiler = shutil.which("gcc")
        self.assertIsNotNone(compiler, "Existing host gcc is required; no installation attempted")
        with tempfile.TemporaryDirectory(prefix="pixl-de2-host-") as temp:
            folder = Path(temp)
            for name, content in (stubs or {}).items():
                path = folder / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content)
            src = folder / "test.c"
            src.write_text(source)
            binary = folder / "test.exe"
            command = [compiler, "-std=c11", "-Wall", "-Wextra", "-Wno-unused-parameter", "-Wno-unused-function", "-Werror", "-I", str(folder)]
            for item in includes:
                command += ["-I", str(item)]
            built = subprocess.run(command + [str(src), "-o", str(binary)], capture_output=True, text=True)
            self.assertEqual(built.returncode, 0, built.stdout + built.stderr)
            result = subprocess.run([str(binary)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("PASS", result.stdout)

    def test_real_player_format_and_resource_lifecycle(self):
        self.compile_run(PLAYER_TEST, {"mui_include.h": STUB_MUI, "app_timer.h": STUB_TIMER, "boards.h": "",
            "i18n/language.h": '#define _T(x) #x\n', "nrf_log.h": "",
            "nrf_pwr_mgmt.h": 'static void nrf_pwr_mgmt_feed(void) {}\n'}, [PLAYER, SRC / "mod/vfs"])

    def test_real_central_v3_guard_preserves_destination_and_classic_path(self):
        source = (SRC / "amiibo_helper.c").read_text(encoding="utf-8")
        guard = function(source, "amiibo_helper_generate_amiibo")
        check = function((SRC / "amiidb/db_search.c").read_text(), "is_valid_amiibo_v3")
        self.compile_run('''#include <stdint.h>\n#include <stdbool.h>\n#include <string.h>\n#include <assert.h>\n#include <stdio.h>
typedef int ret_code_t;
typedef struct {unsigned char data[2048];} ntag_t;
#define NRF_ERROR_INVALID_PARAM 1
#define NRF_ERROR_NOT_SUPPORTED 2
static int classic_calls;
static int amiibo_helper_generate_amiibo_ntag215(uint32_t h,uint32_t t,ntag_t *n) {(void)h;(void)t;classic_calls++;n->data[0]=4;return 0;}
''' + check + "\n" + guard + '''
int main(void) {
 ntag_t tag,before;memset(&tag,0xa5,sizeof(tag));before=tag;
 assert(amiibo_helper_generate_amiibo(0x1f000000,0x04c41e03,&tag)==NRF_ERROR_NOT_SUPPORTED);
 assert(classic_calls==0 && memcmp(&tag,&before,sizeof(tag))==0);
 assert(amiibo_helper_generate_amiibo(0,2,NULL)==NRF_ERROR_INVALID_PARAM);
 assert(amiibo_helper_generate_amiibo(0,0x00340102,&tag)==0 && classic_calls==1 && tag.data[0]==4);
 puts("PASS: real V3 guard rejects without changing tag; classic dispatch retained");return 0;
}''')

    def test_real_favorite_sort_null_folder_data_and_antisymmetry(self):
        source = (SRC / "app/amiidb/scene/amiidb_scene_fav_list.c").read_text(encoding="utf-8")
        compare = function(source, "fav_record_compare") + "\n" + function(source, "amiidb_scene_fav_list_list_view_sort_cb")
        self.compile_run('''#include <stdint.h>\n#include <assert.h>\n#include <stdio.h>\n#include <string.h>
#define ICON_FOLDER 1
#define ICON_FILE 2
#define string_cmp strcmp
typedef struct {uint32_t amiibo_head,amiibo_tail;uint8_t game_id;} amiidb_fav_t;
typedef struct {int icon;const char *text;void *user_data;} mui_list_item_t;
''' + compare + '''
int main(void) {
 amiidb_fav_t first={1,2,1},second={2,1,2};
 mui_list_item_t a={ICON_FOLDER,"A",NULL},b={ICON_FOLDER,"B",NULL};
 mui_list_item_t c={ICON_FILE,"C",&first},d={ICON_FILE,"D",&second};
 assert(amiidb_scene_fav_list_list_view_sort_cb(&a,&b)<0);
 assert(amiidb_scene_fav_list_list_view_sort_cb(&b,&a)>0);
 assert(amiidb_scene_fav_list_list_view_sort_cb(&a,&c)<0);
 assert(amiidb_scene_fav_list_list_view_sort_cb(&c,&a)>0);
 assert(amiidb_scene_fav_list_list_view_sort_cb(&c,&d)<0);
 assert(amiidb_scene_fav_list_list_view_sort_cb(&d,&c)>0);
 assert(amiidb_scene_fav_list_list_view_sort_cb(&c,&c)==0);
 puts("PASS: actual favorite comparator handles null folder data and ordering");return 0;
}''')

    def test_real_ui_generation_never_emulates_failed_or_unsupported_tag(self):
        source = (SRC / "app/amiidb/scene/amiidb_scene_amiibo_detail.c").read_text(encoding="utf-8")
        generate = function(source, "amiidb_scene_amiibo_game_list_generate")
        self.compile_run('''#include <stdint.h>\n#include <stdbool.h>\n#include <assert.h>\n#include <stdio.h>\n#include <string.h>
typedef int ret_code_t;
typedef struct {uint32_t head,tail;} db_amiibo_t;
typedef struct {unsigned char data[2048];} ntag_t;
typedef struct {const db_amiibo_t *cur_amiibo;ntag_t ntag;} app_amiidb_t;
#define NRF_SUCCESS 0
#define NRF_ERROR_INVALID_DATA 1
#define NRF_ERROR_NOT_SUPPORTED 2
#define _T(x) #x
static bool m_tag_ready;
static int result,emulated;
static const char *message;
static int amiibo_helper_generate_amiibo(uint32_t h,uint32_t t,ntag_t *n) {(void)h;(void)t;(void)n;return result;}
static bool ntag_emu_set_tag(ntag_t *n) {(void)n;emulated++;return true;}
static bool ntag_emu_prepare_change(void) {return true;}
static bool m_active_slot_persist;
static void amiidb_scene_amiibo_detail_error_msg(app_amiidb_t *app,const char *text) {(void)app;message=text;}
''' + generate + '''
int main(void) {
 db_amiibo_t tag={1,2};app_amiidb_t app={.cur_amiibo=&tag};
 result=NRF_ERROR_NOT_SUPPORTED;amiidb_scene_amiibo_game_list_generate(&app);
 assert(!m_tag_ready && emulated==0 && strcmp(message,"APP_AMIIDB_NOT_SUPPORT_V3")==0);
 result=NRF_ERROR_INVALID_DATA;amiidb_scene_amiibo_game_list_generate(&app);assert(!m_tag_ready && emulated==0);
 app.cur_amiibo=NULL;amiidb_scene_amiibo_game_list_generate(&app);assert(!m_tag_ready && emulated==0);
 app.cur_amiibo=&tag;result=0;amiidb_scene_amiibo_game_list_generate(&app);assert(m_tag_ready && emulated==1);
 puts("PASS: UI applies successful generation only; all failures leave emulator unchanged");return 0;
}''')

    def test_real_large_category_navigation_matches_visible_100_items(self):
        source = (SRC / "app/amiidb/scene/amiidb_scene_amiibo_detail.c").read_text(encoding="utf-8")
        init = function(source, "amiidb_scene_amiibo_game_list_init")
        update = function(source, "amiidb_scene_amiibo_game_list_update")
        self.compile_run('''#include <stdint.h>\n#include <assert.h>\n#include <stdio.h>
#include <stdbool.h>
#define LIST_VIEW_ITEM_MAX_COUNT 100
typedef struct {uint32_t head,tail;} db_amiibo_t;
typedef struct {uint8_t game_id;uint32_t head,tail;} db_link_t;
typedef struct {unsigned max,focus,game;} view_t;
typedef struct {uint16_t game_id_path[8];uint8_t game_id_index,search_game_id,prev_scene_id;const db_amiibo_t *cur_amiibo;view_t *p_amiibo_view;uint16_t result_count;const db_amiibo_t *result_items[100];} app_amiidb_t;\n#define AMIIDB_SCENE_AMIIBO_SEARCH 9\n#define _T(x) #x\nstatic int m_tag_ready;\nstatic void amiidb_scene_amiibo_detail_error_msg(app_amiidb_t *a,const char*m) {(void)a;(void)m;}
static db_link_t link_list[401];static db_amiibo_t tags[400];
static bool ntag_emu_prepare_change(void){return true;}
static void amiidb_scene_amiibo_game_list_generate(app_amiidb_t *a) {(void)a;}
static void amiibo_view_set_max_ntags(view_t*v,unsigned n) {v->max=n;}
static void amiibo_view_set_focus(view_t*v,unsigned n) {v->focus=n;}
static void amiibo_view_set_game_id(view_t*v,unsigned n) {v->game=n;}
static unsigned amiibo_view_get_focus(view_t*v) {return v->focus;}
static const db_amiibo_t *get_amiibo_by_id(uint32_t h,uint32_t t) {(void)t;assert(h>0 && h<=400);return &tags[h-1];}
''' + init + "\n" + update + '''
int main(void) {
 for(unsigned i=0;i<400;i++){tags[i]=(db_amiibo_t){i+1,2};link_list[i]=(db_link_t){1,i+1,2};}
 view_t view={0};app_amiidb_t app={.game_id_path={1},.cur_amiibo=&tags[99],.p_amiibo_view=&view};
 app.result_count=100;for(unsigned i=0;i<100;i++)app.result_items[i]=&tags[i];\n amiidb_scene_amiibo_game_list_init(&app);assert(view.max==100 && view.focus==99);
 view.focus=0;amiidb_scene_amiibo_game_list_update(&app);assert(app.cur_amiibo==&tags[0]);
 view.focus=99;amiidb_scene_amiibo_game_list_update(&app);assert(app.cur_amiibo==&tags[99]);
 for(unsigned i=0;i<100;i++){app.result_items[i]=&tags[100+i];}app.cur_amiibo=&tags[199];\n amiidb_scene_amiibo_game_list_init(&app);assert(view.max==100 && view.focus==99);\n view.focus=0;amiidb_scene_amiibo_game_list_update(&app);assert(app.cur_amiibo==&tags[100]);\n puts("PASS: 400-link category navigation follows visible page one and two");return 0;
}''')


if __name__ == "__main__":
    unittest.main()
