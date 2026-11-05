"""Real C keyboard, favorite-dialog and slot failure tests. Offline only."""
from pathlib import Path
import importlib.util
import unittest

FW = Path(__file__).resolve().parents[2]
SRC = FW / 'application/src'
spec = importlib.util.spec_from_file_location('de2_native', FW / 'tests/de2/test_player_v3.py')
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


class InputSlotTests(native.NativeTests):
    test_real_player_format_and_resource_lifecycle = None
    test_real_central_v3_guard_preserves_destination_and_classic_path = None
    test_real_favorite_sort_null_folder_data_and_antisymmetry = None
    test_real_ui_generation_never_emulates_failed_or_unsupported_tag = None
    test_real_large_category_navigation_matches_visible_100_items = None

    def test_real_keyboard_byte_limits_empty_delete_utf8_and_row_switch(self):
        source = (SRC / 'mui/view/mui_text_input.c').read_text()
        keyboard = source[source.index('#define LIST_ITEM_HEIGHT'):source.index('static void mui_text_input_on_draw')]
        functions = '\n'.join(native.function(source, name) for name in [
            'mui_text_input_on_input', 'mui_text_input_on_exit', 'mui_text_input_set_input_text',
            'mui_text_input_set_max_length', 'mui_text_input_reset', 'mui_text_input_set_focus_key'])
        self.compile_run(r'''
#include <assert.h>
#include <stdio.h>
#include <ctype.h>
#include "mui_text_input.h"
enum {INPUT_TYPE_SHORT,INPUT_TYPE_LONG,INPUT_TYPE_REPEAT};
enum {INPUT_KEY_LEFT,INPUT_KEY_RIGHT,INPUT_KEY_CENTER};
''' + keyboard + '\n' + functions + r'''
static void key(mui_text_input_t *input,int kind,int button){mui_input_event_t event={kind,button};mui_text_input_on_input(input->p_view,&event);}
int main(void) {
 assert(keyboard_origin_x==1 && keyboard_origin_y==29);
 mui_text_input_t input={0};mui_view_t view={.user_data=&input};input.p_view=&view;
 string_init(input.header);string_init(input.input_text);
 mui_text_input_set_focus_key(&input,BACKSPACE_KEY);key(&input,INPUT_TYPE_SHORT,INPUT_KEY_CENTER);assert(string_size(input.input_text)==0);
 mui_text_input_set_max_length(&input,32);mui_text_input_set_focus_key(&input,'q');
 for(unsigned i=0;i<40;i++)key(&input,INPUT_TYPE_SHORT,INPUT_KEY_CENTER);
 assert(string_size(input.input_text)==32);
 mui_text_input_set_input_text(&input,"1234567890123456789012345678901234567890");assert(string_size(input.input_text)==32);
 mui_text_input_set_max_length(&input,3);assert(strcmp(string_get_cstr(input.input_text),"123")==0);
 mui_text_input_set_input_text(&input,"a\xc3\xa4z");assert(strcmp(string_get_cstr(input.input_text),"a\xc3\xa4")==0);
 mui_text_input_set_max_length(&input,2);assert(strcmp(string_get_cstr(input.input_text),"a")==0);
 mui_text_input_set_max_length(&input,0);mui_text_input_set_input_text(&input,"a\xe2\x82\xac");
 mui_text_input_set_focus_key(&input,BACKSPACE_KEY);key(&input,INPUT_TYPE_SHORT,INPUT_KEY_CENTER);assert(strcmp(string_get_cstr(input.input_text),"a")==0);
 input.focus_row=0;input.focus_column=13;key(&input,INPUT_TYPE_LONG,INPUT_KEY_RIGHT);assert(input.focus_row==1 && input.focus_column==13);
 key(&input,INPUT_TYPE_SHORT,INPUT_KEY_CENTER);assert(strcmp(string_get_cstr(input.input_text),"a6")==0);
 input.focus_row=250;input.focus_column=250;key(&input,INPUT_TYPE_SHORT,INPUT_KEY_CENTER);assert(input.focus_row==0 && input.focus_column==13);
 mui_text_input_set_max_length(&input,1);mui_text_input_on_exit(&view);assert(input.max_length==0);
 mui_text_input_set_input_text(&input,"unlimited again");assert(string_size(input.input_text)==15);
 mui_text_input_set_max_length(&input,3);mui_text_input_reset(&input);assert(input.max_length==0 && string_size(input.input_text)==0);
 string_clear(input.header);string_clear(input.input_text);
 puts("PASS: real keyboard bounds, empty backspace, UTF8 boundaries, row changes and per-session limits");return 0;
}
''', {'mui_include.h': '''#pragma once
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "m-string.h"
typedef struct {void *user_data;} mui_view_t;
typedef struct {int type,key;} mui_input_event_t;
'''}, includes=[SRC / 'mui/view', FW / 'components/mlib'])

    def test_real_favorite_dialog_empty_cancel_error_and_success(self):
        names = [('fav_list', 'amiidb_scene_fav_list_reload'), ('fav_select', 'amiidb_scene_fav_select_reload'),
                 ('fav_list_menu', 'amiidb_scene_fav_list_menu_on_enter')]
        for name, reload_name in names:
            with self.subTest(scene=name):
                source = (SRC / f'app/amiidb/scene/amiidb_scene_{name}.c').read_text()
                function = native.function(source, f'amiidb_scene_{name}_text_input_event_cb')
                self.compile_run(r'''
#include <stdio.h>
#include <assert.h>
#include <string.h>
#include <stdint.h>
enum {MUI_TEXT_INPUT_EVENT_CONFIRMED,MUI_TEXT_INPUT_EVENT_CANCELLED};
#define VFS_OK 0
typedef int mui_text_input_event_t;
typedef struct {int cur_fav_dir;} app_amiidb_t;
typedef struct {void *user_data;const char *text;} mui_text_input_t;
static int writes,returned,errors,write_result;
static const char *mui_text_input_get_input_text(mui_text_input_t *i){return i->text;}
static int amiidb_api_fav_create_dir(const char *s){assert(*s);writes++;return write_result;}
static void string_reset(int x){(void)x;}
static void amiidb_fav_show_error(app_amiidb_t *a,int r){(void)a;assert(r<0);errors++;}
static void amiidb_scene_fav_list_menu_back(app_amiidb_t*a){(void)a;returned++;}
''' + f'static void {reload_name}(app_amiidb_t *a){{(void)a;returned++;}}\n' + function + r'''
int main(void){app_amiidb_t app={0};mui_text_input_t input={&app,""};
''' + f'amiidb_scene_{name}_text_input_event_cb(MUI_TEXT_INPUT_EVENT_CONFIRMED,&input);\n' + r'''
 assert(writes==0 && returned==1);input.text="ignored";
''' + f'amiidb_scene_{name}_text_input_event_cb(MUI_TEXT_INPUT_EVENT_CANCELLED,&input);\n' + r'''
 assert(writes==0 && returned==2);write_result=-1;
''' + f'amiidb_scene_{name}_text_input_event_cb(MUI_TEXT_INPUT_EVENT_CONFIRMED,&input);\n' + r'''
 assert(writes==1 && returned==2 && errors==1);write_result=0;
''' + f'amiidb_scene_{name}_text_input_event_cb(MUI_TEXT_INPUT_EVENT_CONFIRMED,&input);\n' + r'''
 assert(writes==2 && returned==3);puts("PASS: actual favorite callback no-I/O cancel, visible error and success return");return 0;}
''')


    def test_real_slot_recovery_exact_io_and_metadata_transaction(self):
        self.compile_run(r'''
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "amiidb_api_slot.h"
#include "vfs.h"
#include "vfs_meta.h"
#include "vfs_persist.h"
#include "settings.h"
static int recovery_error,stat_error,short_read,write_error,read_calls,writes,stat_calls,metadata_calls;
static size_t file_size=540;static vfs_meta_t fake_meta;
static settings_data_t settings={.amiidb_data_slot_num=50};
settings_data_t *settings_get_data(void){return &settings;}
static int stat_file(const char*p,vfs_obj_t*o){assert(strncmp(p,"/amiibo/data/",13)==0);stat_calls++;o->type=VFS_TYPE_REG;o->size=file_size;memset(o->meta,0,128);return stat_error;}
static int read_data(const char*p,void*b,size_t n){(void)p;assert(n==file_size && n<=2048);read_calls++;memset(b,0x61,n);return short_read?(int)n-1:(int)n;}
static int update_meta(const char*p,void*b,size_t n){(void)p;(void)b;(void)n;metadata_calls++;return 0;}
static vfs_driver_t driver={.stat_file=stat_file,.read_file_data=read_data,.update_file_meta=update_meta};
vfs_driver_t *vfs_get_driver(vfs_drive_t d){assert(d==VFS_DRIVE_EXT);return &driver;}
int32_t vfs_persist_recover(vfs_driver_t*d){assert(d==&driver);return recovery_error;}
int32_t vfs_persist_write(vfs_driver_t*d,const char*p,const void*b,size_t n){
 (void)d;(void)p;(void)b;(void)n;
 assert(!"Unexpected NFC-update path in slot-replacement contract");return VFS_ERR_FAIL;
}
int32_t vfs_persist_write_meta(vfs_driver_t*d,const char*p,const void*b,size_t n,const uint8_t*m){
 assert(d==&driver && p && b && m && (n==540 || n==2048));
 for(size_t i=0;i<128;i++)assert(m[i]==0xa6);
 writes++;return write_error?write_error:(int32_t)n;
}
void vfs_meta_decode(uint8_t*b,uint8_t n,vfs_meta_t*m){(void)b;assert(n==128);*m=fake_meta;}
void vfs_meta_encode(uint8_t*b,uint8_t n,vfs_meta_t*m){assert(n==128 && m->has_amiibo_id && m->has_flags);memset(b,0xa6,n);}
bool is_valid_amiibo_v3(uint32_t h,uint32_t t){return h==1 && t==3;}
#include "amiidb_api_slot.c"
int main(void){
 ntag_t tag;memset(&tag,0,sizeof(tag));
 recovery_error=VFS_ERR_CRPT;assert(amiidb_api_slot_read(0,&tag)==VFS_ERR_CRPT && stat_calls==0 && read_calls==0);
 assert(amiidb_api_slot_write(0,&tag)==VFS_ERR_CRPT && writes==0);recovery_error=0;
 stat_error=VFS_ERR_NOOBJ;assert(amiidb_api_slot_read(0,&tag)==VFS_ERR_NOOBJ && read_calls==0);
 stat_error=VFS_ERR_NODEV;assert(amiidb_api_slot_read(0,&tag)==VFS_ERR_NODEV);stat_error=0;
 file_size=539;assert(amiidb_api_slot_read(0,&tag)==VFS_ERR_CRPT && read_calls==0);
 const unsigned sizes[]={532,540,572,2048};
 fake_meta.has_amiibo_id=true;fake_meta.amiibo_head=1;fake_meta.amiibo_tail=3;
 fake_meta.has_notes=true;memset(fake_meta.notes,'n',sizeof(fake_meta.notes));
 for(unsigned i=0;i<4;i++){file_size=sizes[i];assert(amiidb_api_slot_read(0,&tag)==0);assert(tag.notes[90]==0);assert(tag.type==(file_size==2048?NTAG_I2C_PLUS_2K:NTAG_215));}
 short_read=1;assert(amiidb_api_slot_read(0,&tag)==VFS_ERR_CRPT);short_read=0;
 for(unsigned i=0;i<2;i++){tag.type=i?NTAG_I2C_PLUS_2K:NTAG_215;assert(amiidb_api_slot_write(49,&tag)==0);}
 assert(writes==2 && metadata_calls==0);write_error=VFS_ERR_NOSPC;assert(amiidb_api_slot_write(0,&tag)==VFS_ERR_NOSPC);
 assert(amiidb_api_slot_write(50,&tag)<0 && amiidb_api_slot_read(50,&tag)<0 && amiidb_api_slot_read(0,NULL)<0);
 puts("PASS: actual slot recovery gate, exact sizes, error preservation and atomic data+128-byte metadata dispatch");return 0;}
''', {'boards.h': '', 'settings.h': '''#pragma once
#include <stdint.h>
typedef struct {uint8_t amiidb_data_slot_num;} settings_data_t;
settings_data_t *settings_get_data(void);
''', 'amiibo_helper.h': '''#pragma once
#include <stdbool.h>
#include <stdint.h>
#define NRF_SUCCESS 0
static uint32_t to_little_endian_int32(const uint8_t *p){return ((uint32_t)p[0]<<24)|((uint32_t)p[1]<<16)|((uint32_t)p[2]<<8)|p[3];}
'''}, includes=[SRC / 'amiidb', SRC / 'app/amiidb/api', SRC / 'mod/vfs', SRC / 'ntag'])

    def test_real_search_ui_paging_filter_and_selected_record(self):
        source = (SRC / 'app/amiidb/scene/amiidb_scene_amiibo_search.c').read_text()
        source = '\n'.join(line for line in source.splitlines() if not line.startswith('#include'))
        self.compile_run(r'''
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "m-string.h"
#include "amiidb_api_db.h"
#define _T(x) label(#x)
static const char *label(const char*s){return strcmp(s,"DE3_SEARCH_PAGE")==0?"Page %u/%u (%u)":s;}
enum {MUI_LIST_VIEW_EVENT_SELECTED,MUI_LIST_VIEW_EVENT_LONG_SELECTED};
enum {MUI_TEXT_INPUT_EVENT_CONFIRMED,MUI_TEXT_INPUT_EVENT_CANCELLED};
enum {ICON_EXIT,ICON_SEARCH,ICON_SETTINGS,ICON_PREV,ICON_NEXT,ICON_FILE,ICON_FOLDER,ICON_PAGE,ICON_ERROR};
enum {AMIIDB_SCENE_MAIN,AMIIDB_SCENE_AMIIBO_SEARCH,AMIIDB_SCENE_AMIIBO_DETAIL};
enum {AMIIDB_VIEW_ID_INPUT,AMIIDB_VIEW_ID_LIST};
typedef int mui_list_view_event_t;typedef int mui_text_input_event_t;
typedef struct {unsigned icon;void *user_data;char text[128];} mui_list_item_t;
typedef struct {void *user_data;unsigned count,focus,scroll;mui_list_item_t items[120];} mui_list_view_t;
typedef struct input_s {void *user_data;size_t max;char text[100];void(*cb)(int,struct input_s*);} mui_text_input_t;
typedef struct {mui_list_view_t *p_list_view;mui_text_input_t *p_text_input;void *p_toast_view,*p_scene_dispatcher,*p_view_dispatcher;string_t search_str;uint8_t search_game_id,prev_scene_id;uint16_t search_page,search_filter_page,result_count,result_total,cur_scroll_offset;uint8_t cur_focus_index;bool search_filter_select,search_restore_focus;const db_amiibo_t *cur_amiibo,*result_items[100];} app_amiidb_t;
static unsigned scene,view,errors;
static void *mui_list_view_get_user_data(mui_list_view_t*v){return v->user_data;}
static void mui_list_view_set_user_data(mui_list_view_t*v,void*p){v->user_data=p;}
static void mui_list_view_set_selected_cb(mui_list_view_t*v,void(*cb)(int,mui_list_view_t*,mui_list_item_t*)){(void)v;(void)cb;}
static void mui_list_view_set_focus(mui_list_view_t*v,unsigned n){v->focus=n;}
static void mui_list_view_set_scroll_offset(mui_list_view_t*v,unsigned n){v->scroll=n;}
static unsigned mui_list_view_get_focus(mui_list_view_t*v){return v->focus;}
static unsigned mui_list_view_get_scroll_offset(mui_list_view_t*v){return v->scroll;}
static void mui_list_view_clear_items(mui_list_view_t*v){v->count=0;}
static void mui_list_view_add_item(mui_list_view_t*v,unsigned icon,const char*s,void*p){assert(v->count<120 && strlen(s)<128);mui_list_item_t *i=&v->items[v->count++];i->icon=icon;i->user_data=p;strcpy(i->text,s);}
static int (*comparator)(const mui_list_item_t*,const mui_list_item_t*);
static int compare(const void*a,const void*b){return comparator(a,b);}
static void mui_list_view_sort(mui_list_view_t*v,int(*cb)(const mui_list_item_t*,const mui_list_item_t*)){comparator=cb;qsort(v->items,v->count,sizeof(v->items[0]),compare);}
static void mui_toast_view_show(void*p,const char*s){(void)p;(void)s;errors++;}
static void mui_scene_dispatcher_next_scene(void*p,unsigned s){(void)p;scene=s;}
static void mui_view_dispatcher_switch_to_view(void*p,unsigned s){(void)p;view=s;}
static const char *mui_text_input_get_input_text(mui_text_input_t*i){return i->text;}
static void mui_text_input_set_max_length(mui_text_input_t*i,size_t n){i->max=n;}
static void mui_text_input_set_input_text(mui_text_input_t*i,const char*s){assert(strlen(s)<sizeof(i->text));strcpy(i->text,s);}
static void mui_text_input_set_header(mui_text_input_t*i,const char*s){(void)i;(void)s;}
static void mui_text_input_set_event_cb(mui_text_input_t*i,void(*cb)(int,mui_text_input_t*)){i->cb=cb;}
static bool isChineseLanguage(void){return false;}
const char *get_amiibo_display_name(const db_amiibo_t*a){return a->name_en;}
const db_game_t game_list[]={{1,0,"Zulu game","",0,0},{2,0,"Alpha game","",0,0},{0}};
static db_amiibo_t records[305];
int32_t amiidb_api_db_search_page(const char*s,uint8_t game,uint16_t page,const db_amiibo_t**items,uint16_t*total){
 *total=game?1:305;if(strcmp(s,"missing")==0){*total=0;return 0;}
 unsigned offset=game?0:(page>305/AMIIDB_RESULT_PAGE_SIZE?305/AMIIDB_RESULT_PAGE_SIZE*AMIIDB_RESULT_PAGE_SIZE:page*AMIIDB_RESULT_PAGE_SIZE),count=game?1:305-offset;if(count>AMIIDB_RESULT_PAGE_SIZE)count=AMIIDB_RESULT_PAGE_SIZE;
 for(unsigned i=0;i<count;i++){items[i]=&records[offset+i];}return count;
}
int32_t amiidb_api_db_game_window(uint8_t parent,bool all,bool by_name,uint32_t offset,uint16_t limit,const db_game_t**items,uint16_t*total){
 (void)parent;assert(all&&by_name);*total=2;if(!limit||offset>=2)return 0;
 unsigned n=0;for(unsigned i=offset;i<2&&n<limit;i++)items[n++]=&game_list[1-i];return n;
}
''' + source + r'''
static mui_list_item_t *find(mui_list_view_t *v,unsigned icon){for(unsigned i=0;i<v->count;i++)if(v->items[i].icon==icon)return &v->items[i];return NULL;}
static void choose(mui_list_view_t*v,unsigned icon){mui_list_item_t item=*find(v,icon);search_selected(MUI_LIST_VIEW_EVENT_SELECTED,v,&item);}
int main(void){
 for(unsigned i=0;i<305;i++){records[i]=(db_amiibo_t){i,2,"Record",""};}
 mui_list_view_t list={0};mui_text_input_t input={0};app_amiidb_t app={.p_list_view=&list,.p_text_input=&input};input.user_data=&app;list.user_data=&app;string_init(app.search_str);
 amiidb_scene_amiibo_search_on_enter(&app);assert(app.result_count==AMIIDB_RESULT_PAGE_SIZE && app.result_total==305 && app.search_page==0 && !find(&list,ICON_PREV));
 choose(&list,ICON_NEXT);assert(app.search_page==1 && app.result_items[0]==&records[AMIIDB_RESULT_PAGE_SIZE] && app.result_items[AMIIDB_RESULT_PAGE_SIZE-1]==&records[2*AMIIDB_RESULT_PAGE_SIZE-1]);
 choose(&list,ICON_FILE);assert(scene==AMIIDB_SCENE_AMIIBO_DETAIL && app.cur_amiibo==&records[AMIIDB_RESULT_PAGE_SIZE] && app.prev_scene_id==AMIIDB_SCENE_AMIIBO_SEARCH);
 amiidb_scene_amiibo_search_on_exit(&app);amiidb_scene_amiibo_search_on_enter(&app);assert(app.search_page==1 && app.result_items[0]==&records[AMIIDB_RESULT_PAGE_SIZE]);
 while(find(&list,ICON_NEXT)){choose(&list,ICON_NEXT);}assert(app.search_page==305/AMIIDB_RESULT_PAGE_SIZE && app.result_count==305%AMIIDB_RESULT_PAGE_SIZE && !find(&list,ICON_NEXT));
 choose(&list,ICON_PREV);assert(app.search_page==305/AMIIDB_RESULT_PAGE_SIZE-1);
 choose(&list,ICON_SETTINGS);assert(app.search_filter_select && list.count==5 && strcmp(list.items[0].text,"Alpha game")==0 && list.items[2].user_data==NULL);
 choose(&list,ICON_FOLDER);assert(!app.search_filter_select && app.search_game_id==2 && app.search_page==0 && app.result_count==1);
 choose(&list,ICON_SEARCH);assert(view==AMIIDB_VIEW_ID_INPUT && input.max==32 && input.cb==search_input_cb);
 strcpy(input.text,"missing");input.cb(MUI_TEXT_INPUT_EVENT_CONFIRMED,&input);assert(app.result_count==0 && app.result_total==0 && find(&list,ICON_ERROR) && view==AMIIDB_VIEW_ID_LIST);
 choose(&list,ICON_EXIT);assert(scene==AMIIDB_SCENE_MAIN && errors==0);
 string_clear(app.search_str);puts("PASS: actual search UI next/previous, selected page record, filter sorting/reset and text return");return 0;}
''', includes=[SRC / 'amiidb', SRC / 'app/amiidb/api', FW / 'components/mlib'])


if __name__ == '__main__':
    unittest.main()
