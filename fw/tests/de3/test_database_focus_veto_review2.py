"""Actual-C database navigation across denied and successful tag transitions.

The source functions for input, event routing, detail entry and all five detail
origins are extracted verbatim. NFC, crypto, catalog and storage are controlled
host boundaries. This test neither accesses a device nor proves physical NFC.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from root_host import function


HARNESS = r'''
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ntag_def.h"
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"CHECK %d: %s\n",__LINE__,#x); return 71; } } while(0)
#define _T(x) #x
#define string_get_cstr(s) (s)
#define LIST_VIEW_ITEM_MAX_COUNT 24
#define NRF_SUCCESS 0
#define NRF_ERROR_INVALID_DATA 13
#define NRF_ERROR_NOT_SUPPORTED 8
#define VFS_OK 0
#define VFS_ERR_NOOBJ -1
#define VFS_ERR_IO -5
#define APP_TIMER_DEF(x) static int x
#define APP_TIMER_MODE_SINGLE_SHOT 0
#define APP_ERROR_CHECK(x) do { if(x) abort(); } while(0)
enum {INPUT_KEY_LEFT,INPUT_KEY_CENTER,INPUT_KEY_RIGHT};
enum {INPUT_TYPE_PRESS,INPUT_TYPE_RELEASE,INPUT_TYPE_SHORT,INPUT_TYPE_LONG,INPUT_TYPE_REPEAT};
enum {AMIIBO_VIEW_EVENT_UPDATE,AMIIBO_VIEW_EVENT_DESC_UPDATE,AMIIBO_VIEW_EVENT_MENU};
enum {AMIIDB_SCENE_GAME_LIST,AMIIDB_SCENE_FAV_LIST,AMIIDB_SCENE_AMIIBO_SEARCH,
      AMIIDB_SCENE_RECENT,AMIIDB_SCENE_DATA_LIST,AMIIDB_SCENE_AMIIBO_DETAIL_MENU};
enum {AMIIDB_VIEW_ID_DETAIL,FAV_TYPE_FAV=1};
typedef unsigned ret_code_t,amiibo_view_event_t,ntag_event_type_t;
typedef struct {unsigned type,key;} mui_input_event_t;
typedef struct {void *user_data;} mui_view_t;
typedef struct {uint32_t head,tail;} db_amiibo_t;
typedef struct {uint8_t game_id;uint32_t amiibo_head,amiibo_tail;} amiidb_fav_t;
typedef struct {uint8_t fav_type;union {amiidb_fav_t fav;char folder[48];} fav_data;} amiidb_fav_info_t;
typedef struct {amiidb_fav_t items[24];unsigned count;} fav_array_t;
typedef struct amiibo_view_s {
    bool windowed_favorites; uint8_t focus,max_ntags,info_page,game_id;
    uint16_t desc_offset,desc_total,desc_page_size;
    uint8_t desc_step;
    bool desc_auto_scroll_disabled;
    const db_amiibo_t *catalog_entry;
    ntag_t *ntag;
    void *user_data;
    void (*event_cb)(amiibo_view_event_t,struct amiibo_view_s *);
} amiibo_view_t;
typedef struct {
    amiibo_view_t *p_amiibo_view;
    void *p_scene_dispatcher,*p_view_dispatcher;
    ntag_t ntag;
    unsigned prev_scene_id,result_count;
    const db_amiibo_t *result_items[24],*cur_amiibo;
    uint8_t cur_slot_index,game_id_index,search_game_id;
    uint8_t game_id_path[8];
    amiidb_fav_t cur_fav;
    fav_array_t fav_array;
    char cur_fav_dir[64];
} app_amiidb_t;
typedef struct {uint8_t amiidb_data_slot_num;} settings_data_t;
static settings_data_t settings={10};
static db_amiibo_t figures[24];
static amiidb_fav_t favorites[24];
static unsigned favorite_count;
static ntag_t rf_tag;
static bool allow=true,load_error;
static unsigned prepares,reads,generates,rf_sets,recent_notes,errors,views,menus;
static bool amiibo_info_input(uint8_t *page,mui_input_event_t *event){(void)page;(void)event;return false;}
static void amiibo_view_reset_desc_scroll(amiibo_view_t*v){v->desc_offset=0;}
static void amiibo_view_stop_desc_anim(amiibo_view_t*v){(void)v;}
static uint16_t amiibo_view_desc_max_offset(amiibo_view_t*v){return v->desc_total>v->desc_page_size?v->desc_total-v->desc_page_size:0;}
static void amiibo_view_set_focus(amiibo_view_t*v,uint8_t n){v->focus=n;}
static uint8_t amiibo_view_get_focus(amiibo_view_t*v){return v->focus;}
static void amiibo_view_set_max_ntags(amiibo_view_t*v,uint8_t n){v->max_ntags=n;}
static void amiibo_view_set_game_id(amiibo_view_t*v,uint16_t n){v->game_id=n;}
static void amiibo_view_set_ntag(amiibo_view_t*v,ntag_t*n){v->ntag=n;}
static void amiibo_view_set_event_cb(amiibo_view_t*v,void(*cb)(amiibo_view_event_t,amiibo_view_t*)){v->event_cb=cb;}
static settings_data_t *settings_get_data(void){return &settings;}
static bool ntag_emu_prepare_change(void){prepares++;return allow;}
static bool ntag_emu_set_tag(ntag_t*n){rf_sets++;rf_tag=*n;return true;}
static void ntag_emu_set_update_cb(void(*cb)(ntag_event_type_t,void*,ntag_t*),void*app){(void)cb;(void)app;}
static void ntag_update_cb(ntag_event_type_t t,void*c,ntag_t*n){(void)t;(void)c;(void)n;}
static void ntag_generate_timer_request(void*c){(void)c;}
static int app_timer_create(int*t,unsigned mode,void(*cb)(void*)){(void)t;(void)mode;(void)cb;return 0;}
static void mui_view_dispatcher_switch_to_view(void*d,unsigned id){(void)d;(void)id;views++;}
static void mui_scene_dispatcher_next_scene(void*d,unsigned id){(void)d;(void)id;menus++;}
static void amiidb_scene_amiibo_detail_error_msg(app_amiidb_t*a,const char*m){(void)a;(void)m;errors++;}
static void amiidb_scene_amiibo_detail_no_key_msg(app_amiidb_t*a){(void)a;errors++;}
static bool amiibo_helper_is_key_loaded(void){return true;}
static bool is_valid_amiibo_v3(uint32_t h,uint32_t t){(void)h;(void)t;return false;}
static const db_amiibo_t *get_amiibo_by_id(uint32_t h,uint32_t t){for(unsigned i=0;i<24;i++)if(figures[i].head==h&&figures[i].tail==t)return &figures[i];return NULL;}
static uint8_t amiidb_recent_game(const db_amiibo_t*f){return (uint8_t)(f->head+20);}
static void amiidb_recent_note(const db_amiibo_t*f,unsigned g){(void)f;(void)g;recent_notes++;}
static ret_code_t amiibo_helper_generate_amiibo(uint32_t h,uint32_t t,ntag_t*n){
    generates++;
    /* An intentionally mutating lower-layer error demonstrates that this
     * focus fix does not establish blanket tag retention after load errors. */
    memset(n,load_error?0xe1:0x31,sizeof(*n));n->type=NTAG_215;n->data[0]=(uint8_t)h;n->data[1]=(uint8_t)t;
    return load_error?NRF_ERROR_INVALID_DATA:NRF_SUCCESS;
}
static int32_t amiidb_api_slot_read(uint8_t slot,ntag_t*n){reads++;memset(n,load_error?0xe2:0x42,sizeof(*n));n->type=NTAG_215;n->data[0]=slot;return load_error?VFS_ERR_IO:VFS_OK;}
static ret_code_t ntag_store_new_rand(ntag_t*n){memset(n,0x57,sizeof(*n));n->type=NTAG_215;return NRF_SUCCESS;}
#define amiidb_fav_array_reset(a) ((a).count=0)
#define amiidb_fav_array_size(a) ((a).count)
#define amiidb_fav_array_get(a,i) (&(a).items[(i)])
static amiidb_fav_t *push_fav(fav_array_t *array) { return array->count < 24 ? &array->items[array->count++] : NULL; }
#define amiidb_fav_array_push_new(a) push_fav(&(a))
static int32_t amiidb_api_fav_list_dir(const char*d,void(*cb)(amiidb_fav_info_t*,void*),void*ctx){
    (void)d;
    for(unsigned i=0;i<favorite_count;i++){amiidb_fav_info_t info={.fav_type=FAV_TYPE_FAV,.fav_data.fav=favorites[i]};cb(&info,ctx);}
    return VFS_OK;
}
/* ACTUAL_GLOBALS */
/* ACTUAL_FUNCTIONS */
static void reset_counts(void){prepares=reads=generates=rf_sets=recent_notes=errors=views=menus=0;}
int main(int argc,char**argv){
    (void)m_generate_generation;
    CHECK(argc==2);unsigned id=(unsigned)atoi(argv[1]);
    bool scroll=id>=120;
    unsigned route=scroll?(id-120)/4:id/24;
    unsigned mode=scroll?0:id%4;
    unsigned direction=scroll?((id-120)%4)/2:(id/4)%2;
    unsigned position=scroll?1:(id/8)%3;
    CHECK(route<5);
    unsigned count=route==3?5:route==4?10:24;
    unsigned active=position==0?0:position==1?count/2:count-1;
    app_amiidb_t app={0};amiibo_view_t detail={.user_data=&app,.desc_step=1,.desc_total=100,.desc_page_size=10};
    app.p_amiibo_view=&detail;app.prev_scene_id=route;app.result_count=count;
    favorite_count=count;app.game_id_path[0]=7;app.search_game_id=8;
    for(unsigned i=0;i<24;i++){
        figures[i]=(db_amiibo_t){i+1,i+101};app.result_items[i]=&figures[i];
        favorites[i]=(amiidb_fav_t){i+10,figures[i].head,figures[i].tail};
    }
    app.cur_amiibo=&figures[active];app.cur_fav=favorites[active];app.cur_slot_index=active;
    amiidb_scene_amiibo_detail_on_enter(&app);
    CHECK(m_tag_ready&&detail.focus==active&&detail.max_ntags==count&&views==1&&rf_sets==1&&!errors);
    CHECK(detail.event_cb==amiidb_scene_amiibo_view_on_event);
    reset_counts();
    mui_view_t view={.user_data=&detail};
    mui_input_event_t input={.type=INPUT_TYPE_SHORT,.key=direction?INPUT_KEY_RIGHT:INPUT_KEY_LEFT};
    unsigned expected=(active+count+(direction?1:-1))%count;
    if(scroll){input.type=((id-120)%2)?INPUT_TYPE_REPEAT:INPUT_TYPE_LONG;allow=false;}
    else if(mode==0)allow=false;
    else if(mode==3)load_error=true;
    ntag_t before=app.ntag,before_rf=rf_tag;
    const db_amiibo_t *before_cur=app.cur_amiibo;
    amiidb_fav_t before_fav=app.cur_fav;
    uint8_t before_game=detail.game_id,before_slot=m_active_slot;
    bool before_persist=m_active_slot_persist;
    amiibo_view_on_input(&view,&input);
    if(scroll){
        CHECK(detail.focus==active&&!prepares&&!reads&&!generates&&!rf_sets&&!errors);
        CHECK(!memcmp(&before,&app.ntag,sizeof(before))&&!memcmp(&before_rf,&rf_tag,sizeof(before_rf)));
    }else if(mode==0){
        CHECK(detail.focus==active);
        CHECK(prepares==1&&!reads&&!generates&&!rf_sets&&!errors&&!recent_notes);
        CHECK(!memcmp(&before,&app.ntag,sizeof(before))&&!memcmp(&before_rf,&rf_tag,sizeof(before_rf)));
        CHECK(app.cur_amiibo==before_cur&&!memcmp(&before_fav,&app.cur_fav,sizeof(before_fav)));
        CHECK(detail.game_id==before_game&&m_active_slot==before_slot&&m_active_slot_persist==before_persist);
    }else if(mode==3){
        CHECK(detail.focus==expected&&errors==1&&!m_tag_ready&&!rf_sets&&!recent_notes);
        CHECK(!memcmp(&before_rf,&rf_tag,sizeof(before_rf)));
        CHECK(memcmp(&before,&app.ntag,sizeof(before))!=0);
        CHECK((route==4?reads:generates)==1);
    }else{
        CHECK(detail.focus==expected&&rf_sets==1&&!errors&&m_tag_ready);
        CHECK(!memcmp(&app.ntag,&rf_tag,sizeof(rf_tag)));
        CHECK(route==4?m_active_slot==expected:app.cur_amiibo==&figures[expected]);
        if(route==1)CHECK(!memcmp(&app.cur_fav,&favorites[expected],sizeof(app.cur_fav)));
        if(mode==2){
            before=app.ntag;before_rf=rf_tag;before_cur=app.cur_amiibo;before_fav=app.cur_fav;
            before_game=detail.game_id;before_slot=m_active_slot;before_persist=m_active_slot_persist;
            reset_counts();allow=false;
            /* Two rejected opposite requests must not accumulate focus drift. */
            for(unsigned repeat=0;repeat<2;repeat++){
                input.key=repeat?INPUT_KEY_LEFT:INPUT_KEY_RIGHT;
                amiibo_view_on_input(&view,&input);
                CHECK(detail.focus==expected);
            }
            CHECK(prepares==2&&!reads&&!generates&&!rf_sets&&!errors&&!recent_notes);
            CHECK(!memcmp(&before,&app.ntag,sizeof(before))&&!memcmp(&before_rf,&rf_tag,sizeof(before_rf)));
            CHECK(app.cur_amiibo==before_cur&&!memcmp(&before_fav,&app.cur_fav,sizeof(before_fav)));
            CHECK(detail.game_id==before_game&&m_active_slot==before_slot&&m_active_slot_persist==before_persist);
            /* Clearing the save failure must resume at the actual active row. */
            reset_counts();allow=true;input.key=INPUT_KEY_RIGHT;
            amiibo_view_on_input(&view,&input);
            unsigned recovered=(expected+1)%count;
            CHECK(detail.focus==recovered&&rf_sets==1&&!errors&&m_tag_ready);
            CHECK(!memcmp(&app.ntag,&rf_tag,sizeof(rf_tag)));
            CHECK(route==4?m_active_slot==recovered:app.cur_amiibo==&figures[recovered]);
        }
    }
    CHECK(!menus);
    printf("PASS case=%u origin=%u mode=%u position=%u direction=%u focus=%u\n",id,route,mode,position,direction,detail.focus);
    return 0;
}
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fw', type=Path, default=HERE.parents[1])
    parser.add_argument('--out', type=Path)
    parser.add_argument('--original-negative-control', action='store_true')
    parser.add_argument('--sanitize', action='store_true')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='allmiibo-db-focus-') as temp:
        if args.out is None:
            args.out = Path(temp)
        run(args)


def run(args):
    src = args.fw.resolve() / 'application/src'
    args.out.mkdir(parents=True, exist_ok=True)
    names = ['app/amiidb/view/amiibo_view.c', 'app/amiidb/scene/amiidb_scene_amiibo_detail.c', 'ntag/ntag_def.h']
    hashes = {name: hashlib.sha256((src / name).read_bytes()).hexdigest() for name in names}
    view, scene = [(src / name).read_text() for name in names[:2]]
    globals_ = scene[scene.index('APP_TIMER_DEF('):scene.index('static void ntag_update_cb(')]
    chosen = ['amiidb_scene_amiibo_game_list_generate', 'amiidb_scene_amiibo_game_list_init',
              'amiidb_scene_amiibo_game_list_update', 'amiidb_scene_amiibo_data_list_init',
              'amiidb_scene_amiibo_data_list_update', 'amiidb_scene_amiibo_detail_fav_list_read_cb',
              'amiidb_scene_amiibo_fav_list_init', 'amiidb_scene_amiibo_fav_list_update',
              'amiidb_scene_amiibo_search_list_init', 'amiidb_scene_amiibo_search_update',
              'amiidb_scene_amiibo_view_on_event', 'amiidb_scene_amiibo_detail_on_enter']
    api = (src / 'app/amiidb/api/amiidb_api_fav.c').read_text()
    globals_ += '\n' + scene[scene.index('#define FAV_DETAIL_WINDOW'):scene.index('static int fav_window_compare')]
    chosen.insert(chosen.index('amiidb_scene_amiibo_detail_fav_list_read_cb'), 'fav_window_compare')
    chosen.insert(chosen.index('amiidb_scene_amiibo_fav_list_init'), 'fav_window_load')
    actual = function(api,'fav_record_compare') + '\n' + '\n'.join(function(scene, name) for name in chosen)
    actual += '\n' + function(view, 'amiibo_view_on_input')
    generated = HARNESS.replace('/* ACTUAL_GLOBALS */', globals_).replace('/* ACTUAL_FUNCTIONS */', actual)
    cfile, binary = args.out / 'database_focus.c', args.out / 'database_focus'
    cfile.write_text(generated)
    command = ['gcc', '-std=c11', '-Wall', '-Wextra', '-Werror', '-Wno-unused-function',
               '-Wno-unused-parameter', '-fno-pie', '-no-pie', '-O1', '-g',
               '-I', str(src / 'ntag'), str(cfile), '-o', str(binary)]
    if args.sanitize:
        command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-fno-omit-frame-pointer']
    built = subprocess.run(command, capture_output=True, text=True, timeout=60)
    (args.out / 'build.log').write_text(built.stdout + built.stderr)
    if built.returncode:
        raise RuntimeError(built.stdout + built.stderr)
    cases = []
    for case in range(140):
        negative = case < 96 and case % 4 in (0, 2)
        expected = 71 if args.original_negative_control and negative else 0
        env = dict(os.environ, ASAN_OPTIONS='detect_leaks=0')
        run = subprocess.run([str(binary), str(case)], capture_output=True, text=True, timeout=10, env=env)
        cases.append({'case': case, 'expected_exit': expected, 'exit': run.returncode,
                      'passed': run.returncode == expected, 'stdout': run.stdout, 'stderr': run.stderr})
    unchanged = hashes == {name: hashlib.sha256((src / name).read_bytes()).hexdigest() for name in names}
    result = {'passed': unchanged and all(c['passed'] for c in cases),
              'original_negative_control': args.original_negative_control,
              'source_sha256': hashes, 'sources_unchanged': unchanged,
              'sanitize': args.sanitize, 'leak_sanitizer': False, 'device_access': False,
              'cases': cases, 'limits': [
                  'Verbatim production input, entry, event dispatcher and all database origin routes.',
                  'NFC, crypto, catalog and storage are modeled host boundaries, not physical hardware.',
                  'Save-veto preservation and successful focus updates are tested independently.',
                  'Later modeled generation/I/O failures may mutate the app tag; no blanket old-tag preservation claim.',
                  'LeakSanitizer is unavailable under the managed ptrace runner; AddressSanitizer and UBSan enabled when requested.'
              ]}
    (args.out / 'RESULTS.json').write_text(json.dumps(result, indent=2) + '\n')
    print(f"{'PASS' if result['passed'] else 'FAIL'} {len(cases)} cases; "
          f"{sum(c['exit'] == 71 for c in cases)} expected original failures; sources unchanged={unchanged}")
    if not result['passed']:
        for case in cases:
            if not case['passed']:
                print(case)
        raise SystemExit(1)


if __name__ == '__main__':
    main()
