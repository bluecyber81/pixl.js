"""Actual Chameleon import + save/retry + dispatcher; bounded peripheral seams.

The imported payload must reach the selected main card after an immediate or
retried successful save exactly once. Back, repeated failure or a stale scene
must not fire the continuation. No persistence failure is hidden by a save stub.
"""
import re
import unittest
from root_host import HostTests, SRC, function

PREFIX = r'''

#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define VFS_MAX_PATH_LEN 64
#define VFS_TYPE_REG 1
#define CHELEMEON_DUMP_FOLDER "/chameleon/dump"
#define NRF_LOG_INFO(...) ((void)0)
#define _T(x) #x
#define MUI_SCENE_STACK_CAPACITY 8
#define VIEW_NONE 255
#define MINI_APP_ID_CHAMELEON 7
#define CHAMELEON_SCENE_MENU_CARD_DATA_FILE_LOAD CHAMELEON_SCENE_LOAD
#define EXPECT_FIXED @EXPECT_FIXED@
#define HAS_CONTINUATION @HAS_CONTINUATION@
enum {CHAMELEON_SCENE_MAIN,CHAMELEON_SCENE_MENU,CHAMELEON_SCENE_DATA,CHAMELEON_SCENE_LOAD,CHAMELEON_SCENE_MENU_CARD_TYPE};
enum {TAG_TYPE_UNDEFINED=0};
enum {INPUT_TYPE_SHORT,INPUT_TYPE_LONG,INPUT_KEY_LEFT,INPUT_KEY_CENTER,INPUT_KEY_RIGHT};
typedef struct {unsigned type,key;} mui_input_event_t;
typedef struct {void *user_data;} mui_view_t;
typedef struct {mui_view_t view;} chameleon_view_t;
typedef struct {mui_view_t view;} mui_list_view_t;
typedef struct {mui_view_t view;} mui_msg_box_t;
typedef struct {mui_view_t view;} mui_toast_view_t;
typedef struct {mui_view_t view;} mui_text_input_t;
typedef struct {unsigned view_count;struct{unsigned id;mui_view_t*view;}views[6];mui_view_t*p_active_view;} mui_view_dispatcher_t;
typedef struct {void(*enter_cb)(void*);void(*exit_cb)(void*);} mui_scene_t;
typedef struct {
 unsigned scene_depth,scene_num,default_scene_id;
 uint32_t scene_id_stack[MUI_SCENE_STACK_CAPACITY];
 bool(*transition_guard)(void);void*user_data;const mui_scene_t*p_scene_defines;
} mui_scene_dispatcher_t;
@HEADER@
typedef struct {int type;size_t size;} vfs_obj_t;
typedef struct {bool(*mounted)(void);int(*stat_file)(const char*,vfs_obj_t*);int(*read_file_data)(const char*,void*,size_t);} vfs_driver_t;
static uint8_t cards[50][32], persisted[50][32],selected;
static int fault;
static unsigned errors,allocations,frees;
static unsigned saves,settings_saves,loads,success,visible,irq,sense,fail_stage,failures_left,main_entries;
static bool irq_on,sense_on,launcher_veto;
static unsigned launcher_exits;
static app_chameleon_t *current_app;
static char current_dir[VFS_MAX_PATH_LEN];
static void*mui(void){return NULL;}
static void mui_update(void*p){(void)p;}
static void mui_update_now(void*p){(void)p;}
static void mui_input_modal_boundary(void){}
static void mui_show_memory_error(void*p){(void)p;assert(false);}
static void*mui_mem_malloc(size_t n){allocations++;return fault==5?NULL:malloc(n);}
static void mui_mem_free(void*p){if(p)frees++;free(p);}
static bool mounted(void){return fault!=1;}
static int stat_file(const char*p,vfs_obj_t*obj){assert(strstr(p,"/chosen.bin"));obj->type=VFS_TYPE_REG;obj->size=fault==2?31:32;return fault==3?-5:0;}
static int read_file(const char*p,void*out,size_t n){(void)p;assert(n==32);memset(out,0x72,n);return fault==4?31:32;}
static vfs_driver_t driver={mounted,stat_file,read_file};
static vfs_driver_t*vfs_get_default_driver(void){return &driver;}
static uint8_t*tag_helper_get_active_tag_memory_data(void){return cards[selected];}
static size_t tag_helper_get_active_tag_data_size(void){return 32;}
static int tag_helper_set_nickname(const char*name){assert(!strcmp(name,"chosen.bin"));return fault==6?-5:0;}
static void tag_helper_load_coll_res_from_block0(void){loads++;}
static void chameleon_save_begin(void){}
static bool tag_emulation_save(void){saves++;assert(!irq_on&&!sense_on);if(fault==7)return false;if(fail_stage==1&&failures_left){failures_left--;return false;}memcpy(persisted[selected],cards[selected],32);return true;}
static bool tag_emulation_save_config(void){assert(false);return false;}
static bool chameleon_save_settings(void){settings_saves++;if(fail_stage==2&&failures_left){failures_left--;return false;}return true;}
static void mui_toast_view_show(void*p,const char*t){(void)p;if(!strcmp(t,"APP_CHAMELEON_CARD_DATA_LOAD_SUCCESS"))success++;else errors++;}
static int tag_helper_get_active_tag_type(void){return 1;}
static bool tag_emulation_active_data_ready(void){return true;}
void app_chameleon_show_load_error(app_chameleon_t*a){(void)a;assert(false);}
static void hal_nfc_set_nrfx_irq_enable(bool on){irq_on=on;if(on)irq++;}
static void tag_emulation_sense_run(void){sense_on=true;sense++;}
static void tag_emulation_sense_end(void){sense_on=false;}
static void chameleon_scene_main_event_cb(void){assert(false);}
static void chameleon_view_set_event_cb(void*p,void(*cb)(void)){(void)p;assert(cb==chameleon_scene_main_event_cb);main_entries++;}
static void mui_view_dispatcher_switch_to_view(mui_view_dispatcher_t*p,unsigned id){
 visible=id;for(unsigned i=0;i<p->view_count;i++)if(p->views[i].id==id){p->p_active_view=p->views[i].view;return;}assert(false);
}
static void*mini_app_launcher(void){return current_app;}
static void mini_app_launcher_exit(void*p){assert(p==current_app);launcher_exits++;if(!launcher_veto)current_app=NULL;}
static void*mini_app_launcher_get_app_handle(void*p,unsigned id){assert(p==current_app&&id==7);return current_app;}
'''

MAIN = r'''

int main(void){
 const unsigned slots[]={0,7,49};
 for(unsigned s=0;s<3;s++)for(fault=0;fault<8;fault++){
  selected=slots[s];memset(cards,0xa5,sizeof(cards));memcpy(persisted,cards,sizeof(cards));
  saves=settings_saves=loads=success=irq=sense=main_entries=errors=allocations=frees=0;
  irq_on=sense_on=false;fail_stage=failures_left=0;visible=CHAMELEON_VIEW_ID_LIST;
  mui_scene_t defs[5]={{chameleon_scene_main_on_enter,NULL},{0},{0},{0},{0}};
  mui_scene_dispatcher_t dispatcher={.scene_depth=4,.scene_num=5,.scene_id_stack={0,1,2,3},.p_scene_defines=defs};
  mui_view_t list={0},main={0};mui_view_dispatcher_t views={0};
  app_chameleon_t app={.initialized=true,.p_scene_dispatcher=&dispatcher,.p_view_dispatcher=&views};
  current_app=&app;dispatcher.user_data=&app;app.save_error_view.user_data=&app;
  views.view_count=3;views.views[0].id=CHAMELEON_VIEW_ID_LIST;views.views[0].view=&list;
  views.views[1].id=CHAMELEON_VIEW_ID_MAIN;views.views[1].view=&main;
  views.views[2].id=CHAMELEON_VIEW_ID_SAVE_ERROR;views.views[2].view=&app.save_error_view;views.p_active_view=&list;
  chameleon_scene_menu_card_data_file_load_from_file(&app,"chosen.bin");
  assert(selected==slots[s]);
  bool changed=fault==0||fault==7;
  for(unsigned n=0;n<50;n++)for(unsigned i=0;i<32;i++)assert(cards[n][i]==(changed&&n==selected?0x72:0xa5));
  assert(loads==changed&&saves==changed);
  assert(frees==allocations-(fault==5));
  if(!fault){assert(success==1&&!errors&&visible==CHAMELEON_VIEW_ID_MAIN&&irq_on&&sense_on);
   assert(dispatcher.scene_depth==1&&mui_scene_dispatcher_current_scene(&dispatcher)==CHAMELEON_SCENE_MAIN);}
  else {assert(!success&&!irq_on&&!sense_on&&dispatcher.scene_depth==4);
   assert(visible==(fault==7?CHAMELEON_VIEW_ID_SAVE_ERROR:CHAMELEON_VIEW_ID_LIST));
   assert(errors==(fault==7?0u:1u));
   assert(mui_scene_dispatcher_current_scene(&dispatcher)==CHAMELEON_SCENE_LOAD);}
 }
 fault=0;
 puts("PASS 24 actual import/save/return cases across slots 0/7/49 and all failure seams");

 unsigned cases=0;
 for(fail_stage=0;fail_stage<=2;fail_stage++)for(unsigned scenario=0;scenario<7;scenario++){
  if(!fail_stage&&scenario)continue;
  selected=7;memset(cards,0xa5,sizeof(cards));memcpy(persisted,cards,sizeof(cards));
  saves=settings_saves=loads=success=irq=sense=main_entries=0;irq_on=sense_on=false;
  launcher_exits=0;launcher_veto=scenario==6;
  failures_left=fail_stage?(scenario==1?2:1):0;visible=CHAMELEON_VIEW_ID_LIST;
  mui_scene_t defs[5]={{chameleon_scene_main_on_enter,NULL},{0},{0},{0},{0}};
  mui_scene_dispatcher_t dispatcher={.scene_depth=4,.scene_num=5,.scene_id_stack={0,1,2,3},.p_scene_defines=defs};
  mui_view_t list={0},main={0};mui_view_dispatcher_t views={0};
  app_chameleon_t app={.initialized=true,.p_scene_dispatcher=&dispatcher,.p_view_dispatcher=&views};
  current_app=&app;dispatcher.user_data=&app;app.save_error_view.user_data=&app;
  views.view_count=3;views.views[0].id=CHAMELEON_VIEW_ID_LIST;views.views[0].view=&list;
  views.views[1].id=CHAMELEON_VIEW_ID_MAIN;views.views[1].view=&main;
  views.views[2].id=CHAMELEON_VIEW_ID_SAVE_ERROR;views.views[2].view=&app.save_error_view;views.p_active_view=&list;
  chameleon_scene_menu_card_data_file_load_from_file(&app,"chosen.bin");
  assert(selected==7&&loads==1&&saves==1);
  if(fail_stage){
   assert(visible==CHAMELEON_VIEW_ID_SAVE_ERROR&&dispatcher.scene_depth==4&&!irq_on&&!sense_on);
#if HAS_CONTINUATION
   assert(app.import_return_pending);
#endif
   app.save_error_drawn=true; /* Rendered overlay and fresh gesture, independent of tested modal fence. */
   mui_input_event_t retry={.type=INPUT_TYPE_SHORT,.key=INPUT_KEY_CENTER};
   if(scenario==2){
    mui_input_event_t back={.type=INPUT_TYPE_LONG,.key=INPUT_KEY_CENTER};
    app_chameleon_save_error_input(&app.save_error_view,&back);
    assert(visible==CHAMELEON_VIEW_ID_LIST&&dispatcher.scene_depth==4&&!success&&!irq_on&&!sense_on);
#if HAS_CONTINUATION
    assert(!app.import_return_pending);
#endif
    assert(app_chameleon_save(&app));
    assert(visible==CHAMELEON_VIEW_ID_LIST&&dispatcher.scene_depth==4&&!success&&!irq_on&&!sense_on);
    printf("PASS stage=%s cancel-then-unrelated-save no deferred transition\n",fail_stage==1?"tag-save":"settings-save");
    cases++;continue;
   }
   if(scenario==3){
    dispatcher.scene_id_stack[3]=CHAMELEON_SCENE_MENU; /* Defensive stale-scene control. */
   }
   if(scenario>=4){
    mui_input_event_t right={.type=INPUT_TYPE_SHORT,.key=INPUT_KEY_RIGHT};
    app_chameleon_save_error_input(&app.save_error_view,&right);
    assert(app.discard_state==CHAMELEON_DISCARD_NO&&!success&&saves==1);
    app.save_error_drawn=true;
    if(scenario>=5){
     app_chameleon_save_error_input(&app.save_error_view,&right);
     assert(app.discard_state==CHAMELEON_DISCARD_YES&&!success&&saves==1);
     app.save_error_drawn=true;
    }
    app_chameleon_save_error_input(&app.save_error_view,&retry);
    assert(!success&&saves==1&&!irq_on&&!sense_on&&dispatcher.scene_depth==4);
    if(scenario==5){
     assert(launcher_exits==1&&!current_app);
     puts("PASS accepted explicit discard: no continuation or extra save");cases++;continue;
    }
    assert(current_app==&app&&app.discard_state==CHAMELEON_SAVE_ERROR);
    assert(launcher_exits==(scenario==6));
    app.save_error_drawn=true;
   }
   app_chameleon_save_error_input(&app.save_error_view,&retry);
   if(scenario==1){
    assert(saves==2&&visible==CHAMELEON_VIEW_ID_SAVE_ERROR&&dispatcher.scene_depth==4&&!success&&!irq_on&&!sense_on);
#if HAS_CONTINUATION
    assert(app.import_return_pending);
#endif
    app.save_error_drawn=true;
    app_chameleon_save_error_input(&app.save_error_view,&retry);
   }
   assert(saves==(scenario==1?3u:2u)&&!memcmp(cards[selected],persisted[selected],32));
   if(EXPECT_FIXED&&scenario!=3){
    assert(visible==CHAMELEON_VIEW_ID_MAIN&&dispatcher.scene_depth==1&&success==1&&irq_on&&sense_on&&main_entries==1);
    assert(app_chameleon_save(&app));
    assert(success==1&&main_entries==1); /* Completed continuation cannot run twice. */
    printf("PASS stage=%s failed-saves=%u retry_saved=true selected=7 scene=MAIN success_toast=1 main_entries=1 nfc_active=true\n",fail_stage==1?"tag-save":"settings-save",scenario==1?2:1);
   }else{
    assert(visible==CHAMELEON_VIEW_ID_LIST&&dispatcher.scene_depth==4&&!success&&!irq_on&&!sense_on);
    printf("%s stage=%s retry_saved=true selected=7 scene=IMPORT visible=FILE_LIST depth=4 success_toast=0 nfc_active=false\n",scenario==3?"PASS stale-scene":"OBSERVED",fail_stage==1?"tag-save":"settings-save");
   }
#if HAS_CONTINUATION
   assert(!app.import_return_pending);
#endif
  }else{
   assert(!memcmp(cards[selected],persisted[selected],32));
   assert(visible==CHAMELEON_VIEW_ID_MAIN&&dispatcher.scene_depth==1&&success==1&&irq_on&&sense_on&&main_entries==1);
#if HAS_CONTINUATION
   assert(!app.import_return_pending);
#endif
   assert(app_chameleon_save(&app));assert(success==1&&main_entries==1);
   puts("CONTROL first-save-success selected=7 scene=MAIN visible=CARD depth=1 success_toast=1 nfc_active=true");
  }
  for(unsigned n=0;n<50;n++)if(n!=selected)for(unsigned i=0;i<32;i++)assert(cards[n][i]==0xa5&&persisted[n][i]==0xa5);
  cases++;
 }
 printf("PASS %u coupled cases; expectation=%s; no data loss in bounded persistence model\n",cases,EXPECT_FIXED?"fixed":"original-gap");
}
'''


class ImportReturnTests(HostTests):
    def test_import_failure_retry_return_and_cancel(self):
        files = {
            'app': SRC / 'app/chameleon/app_chameleon.c',
            'header': SRC / 'app/chameleon/app_chameleon.h',
            'importer': SRC / 'app/chameleon/scene/chameleon_scene_menu_card_data_file_load.c',
            'main': SRC / 'app/chameleon/scene/chameleon_scene_main.c',
            'dispatcher': SRC / 'mui/mui_scene_dispatcher.c',
        }
        sources = {key: path.read_text() for key,path in files.items()}
        header = re.sub(r'^\s*#include[^\n]*\n', '', sources['header'], flags=re.M)
        header = header.replace('extern mini_app_t app_chameleon_info;', '')
        code = PREFIX.replace('@HEADER@', header).replace('@EXPECT_FIXED@','1').replace('@HAS_CONTINUATION@',str(int('import_return_pending' in header)))
        for source, name in (
            ('dispatcher', 'mui_scene_dispatcher_next_scene'),
            ('dispatcher', 'mui_scene_dispatcher_current_scene'),
            ('app', 'app_chameleon_pause'),
            ('app', 'app_chameleon_resume'),
            ('app', 'app_chameleon_show_save_error'),
            ('app', 'app_chameleon_save'),
            ('app', 'app_chameleon_save_error_input'),
            ('main', 'chameleon_scene_main_on_enter'),
            ('importer', 'chameleon_browser_cache_free'),
            ('importer', 'chameleon_scene_menu_card_data_file_load_from_file'),
        ):
            code += '\n' + function(sources[source], name)
        self.compile_run(code+MAIN)


if __name__ == '__main__':
    unittest.main()
