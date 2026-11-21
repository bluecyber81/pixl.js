"""Actual Chameleon importer, scene dispatcher and main entry; bounded VFS/NFC seams."""
from pathlib import Path
import unittest

from root_host import HostTests, SRC, function


class ImportReturnTests(HostTests):
    def test_import_returns_to_selected_card_only_after_save(self):
        importer = (SRC / 'app/chameleon/scene/chameleon_scene_menu_card_data_file_load.c').read_text()
        main = (SRC / 'app/chameleon/scene/chameleon_scene_main.c').read_text()
        dispatcher = (SRC / 'mui/mui_scene_dispatcher.c').read_text()
        code = r'''
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
enum {CHAMELEON_SCENE_MAIN,CHAMELEON_SCENE_MENU,CHAMELEON_SCENE_DATA,CHAMELEON_SCENE_LOAD,CHAMELEON_SCENE_MENU_CARD_TYPE};
enum {CHAMELEON_VIEW_ID_MAIN=1,TAG_TYPE_UNDEFINED=0};
typedef struct {void(*enter_cb)(void*);void(*exit_cb)(void*);} mui_scene_t;
typedef struct {
 unsigned scene_depth,scene_num,default_scene_id;
 uint32_t scene_id_stack[MUI_SCENE_STACK_CAPACITY];
 bool(*transition_guard)(void);void*user_data;const mui_scene_t*p_scene_defines;
} mui_scene_dispatcher_t;
typedef struct {void*p_toast_view,*p_view_dispatcher,*p_chameleon_view,*browser_cache;mui_scene_dispatcher_t*p_scene_dispatcher;} app_chameleon_t;
typedef struct {int type;size_t size;} vfs_obj_t;
typedef struct {bool(*mounted)(void);int(*stat_file)(const char*,vfs_obj_t*);int(*read_file_data)(const char*,void*,size_t);} vfs_driver_t;
static uint8_t cards[50][32],selected;
static unsigned saves,loads,allocations,frees,irq,sense,visible,errors,success;
static int fault;
static char current_dir[VFS_MAX_PATH_LEN];
static void*mui(void){return NULL;}
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
static bool app_chameleon_save(app_chameleon_t*app){(void)app;saves++;for(unsigned i=0;i<32;i++)assert(cards[selected][i]==0x72);return fault!=7;}
static void mui_toast_view_show(void*p,const char*t){(void)p;if(!strcmp(t,"APP_CHAMELEON_CARD_DATA_LOAD_SUCCESS"))success++;else errors++;}
static int tag_helper_get_active_tag_type(void){return 1;}
static bool tag_emulation_active_data_ready(void){return true;}
static void app_chameleon_show_load_error(app_chameleon_t*a){(void)a;assert(false);}
static void hal_nfc_set_nrfx_irq_enable(bool on){assert(on&&saves==1&&fault!=7);irq++;}
static void tag_emulation_sense_run(void){sense++;}
static void chameleon_scene_main_event_cb(void){assert(false);}
static void chameleon_view_set_event_cb(void*p,void(*cb)(void)){(void)p;assert(cb==chameleon_scene_main_event_cb);}
static void mui_view_dispatcher_switch_to_view(void*p,unsigned id){(void)p;visible=id;}
'''
        code += function(dispatcher, 'mui_scene_dispatcher_next_scene')
        code += function(dispatcher, 'mui_scene_dispatcher_current_scene')
        code += function(main, 'chameleon_scene_main_on_enter')
        code += function(importer, 'chameleon_browser_cache_free')
        code += function(importer, 'chameleon_scene_menu_card_data_file_load_from_file')
        code += r'''
int main(void){
 const unsigned slots[]={0,7,49};
 for(unsigned s=0;s<3;s++)for(fault=0;fault<8;fault++){
  selected=slots[s];memset(cards,0xa5,sizeof(cards));
  saves=loads=allocations=frees=irq=sense=visible=errors=success=0;
  mui_scene_t defs[5]={{chameleon_scene_main_on_enter,NULL},{0},{0},{0},{0}};
  mui_scene_dispatcher_t dispatcher={.scene_depth=4,.scene_num=5,.scene_id_stack={0,1,2,3},.p_scene_defines=defs};
  app_chameleon_t app={.p_scene_dispatcher=&dispatcher};dispatcher.user_data=&app;
  chameleon_scene_menu_card_data_file_load_from_file(&app,"chosen.bin");
  assert(selected==slots[s]);
  bool changed=fault==0||fault==7;
  for(unsigned n=0;n<50;n++)for(unsigned i=0;i<32;i++)assert(cards[n][i]==(changed&&n==selected?0x72:0xa5));
  assert(loads==changed&&saves==changed);
  assert(frees==allocations-(fault==5));
  if(!fault){assert(success==1&&!errors&&visible==CHAMELEON_VIEW_ID_MAIN&&irq==1&&sense==1);
   assert(dispatcher.scene_depth==1&&mui_scene_dispatcher_current_scene(&dispatcher)==CHAMELEON_SCENE_MAIN);}
  else {assert(!success&&!visible&&!irq&&!sense&&dispatcher.scene_depth==4);
   assert(mui_scene_dispatcher_current_scene(&dispatcher)==CHAMELEON_SCENE_LOAD);}
 }
 puts("PASS 24 actual import/save/return cases: selected slots 0/7/49; short read, metadata, allocation and save failures never start NFC or leave import");
}
'''
        self.compile_run(code)


if __name__ == '__main__':
    unittest.main()
