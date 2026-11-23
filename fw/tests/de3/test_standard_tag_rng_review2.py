"""Actual creation callbacks and NFC engine reject failed standard-tag randomness.

Compiles production store/helper, file callbacks, real slot-read code and
AmiiboLink scene branches. RNG, storage, UI and radio HAL are host boundaries.
No real device, crypto keys or device filesystem access is used.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import subprocess
import tempfile

from root_host import function
import test_file_create_safety as creation

HERE = Path(__file__).resolve().parent


def actual(text, name):
    match = re.search(r'(?m)^(?:static )?(?:[a-zA-Z_][\w]*\s+)+\**' + re.escape(name) + r'\([^;]*?\)\s*\{', text)
    if not match:
        raise ValueError(name)
    return function(text[match.start():], name)


RANDOM = r'''
#define VERIFY_SUCCESS(code) do {if(code)return code;}while(0)
static unsigned rng_calls, rng_fail_at;
static ret_code_t utils_rand_bytes(uint8_t*out,uint8_t n){
 ++rng_calls;for(unsigned i=0;i<n;i++)out[i]=(uint8_t)(17*rng_calls+i);
 return rng_calls==rng_fail_at?19u:NRF_SUCCESS;
}
'''


def store_functions(src):
    store = (src / 'ntag/ntag_store.c').read_text()
    start = store.index('const ntag_t default_ntag215 =')
    return RANDOM + store[start:store.index('};', start) + 2] + '\n' + '\n'.join(
        actual(store, name) for name in ['ntag_store_set_uuid', 'ntag_store_uuid_rand', 'ntag_store_new_rand'])


FILE_MAIN = r'''
int main(int argc,char**argv){
 CHECK(argc==2);int scenario=atoi(argv[1]);reset();
 static app_amiibo_t app={.current_folder="/",.current_file="prior.bin"};active_app=&app;
 mui_text_input_t input_view={&app};
 rng_fail_at=scenario==0||scenario==2?1:scenario==3?2:0;
 input=scenario<2?"new.bin":"3";
 if(scenario<2)amiibo_scene_file_browser_text_input_create_amiibo_event_cb(1,&input_view);
 else {amiibo_scene_file_browser_text_input_create_amiibo_batch_event_cb(1,&input_view);
       while(amiibo_batch_step()){} }
 unsigned expected_writes=scenario==0||scenario==2?0:scenario==1||scenario==3?1:3;
 bool failed=scenario==0||scenario==2||scenario==3;
 CHECK(writes==(int)expected_writes&&errors==(int)failed&&navigations==!failed);
 CHECK(alloc_calls==1&&free_calls==1&&!live_tag&&!batch_owner&&!batch_tag);
 if(failed)CHECK(!strcmp(last_error,"FAILED"));
 if(!expected_writes)CHECK(stored[0]==0xa5);
 else CHECK(stored[0]==4&&stored[1]==17*expected_writes);
 printf("PASS actual file creation RNG case %d, completed files=%u\n",scenario,expected_writes);
 return 0;
}
'''


def file_code(src):
    source = (src / 'app/amiibo/scene/amiibo_scene_file_browser_menu.c').read_text()
    cwalk = (src / 'mod/cwalk2.c').read_text()
    pieces = [actual(cwalk, name) for name in ['bounded_path_length', 'cwalk_append_segment']]
    pieces += [actual(source, name) for name in creation.HELPERS]
    pieces.append(source[source.index('static app_amiibo_t *batch_owner;'):source.index('static void amiibo_batch_release(')])
    pieces += [actual(source, name) for name in ['amiibo_batch_release', 'amiibo_batch_cancel', 'amiibo_batch_step']]
    pieces += [actual(source, name) for name in creation.CALLBACKS]
    base = creation.HARNESS[:creation.HARNESS.index('int main(')]
    base = re.sub(r'static int ntag_store_new_rand[^\n]*\n', 'typedef unsigned ret_code_t;\n' + store_functions(src) + '\n', base)
    return base.replace('/* ACTUAL_CALLBACKS */', '\n'.join(pieces)) + FILE_MAIN


COMMON = r'''
#include <stdlib.h>
#include "vfs.h"
#include "vfs_meta.h"
#define NRF_LOG_WARNING(...) ((void)0)
#define CHECK(x) do{if(!(x)){fprintf(stderr,"CHECK %d: %s\n",__LINE__,#x);return 71;}}while(0)
#define _T(x) #x
static int errors, current_view, current_scene;
static int read_result=NTAG_DATA_SIZE,stat_result=VFS_ERR_NOOBJ,write_result=NTAG_DATA_SIZE;
static unsigned file_reads,file_writes;
static bool require_saved_before_read;
static bool copied_partial;
static int32_t fake_read(const char*path,void*out,size_t n){
 (void)path;++file_reads;
 if(require_saved_before_read)assert(file_writes==1 && !ntag_emu_save_pending());
 if(copied_partial && n >= 16)memset(out,0x71,16);
 if(read_result>0){size_t copied=(size_t)read_result<n?(size_t)read_result:n;memset(out,0x66,copied);return (int32_t)copied;}
 return read_result;
}
static int32_t fake_write(const char*path,void*data,size_t n){(void)path;(void)data;(void)n;++file_writes;return write_result;}
static int32_t fake_stat(const char*path,vfs_obj_t*obj){(void)path;obj->type=VFS_TYPE_REG;obj->size=NTAG_DATA_SIZE;return stat_result;}
static int32_t fake_mkdir(const char*path){(void)path;return VFS_OK;}
static vfs_driver_t driver={.stat_file=fake_stat,.read_file_data=fake_read,.write_file_data=fake_write,.create_dir=fake_mkdir};
vfs_driver_t *vfs_get_driver(vfs_drive_t d){(void)d;return &driver;}
static int32_t vfs_persist_recover(vfs_driver_t*d){(void)d;return VFS_OK;}
void vfs_meta_decode(uint8_t*in,uint8_t size,vfs_meta_t*out){(void)in;(void)size;memset(out,0,sizeof(*out));}
static ntag_type_t amiidb_api_slot_get_tag_type(int32_t n,vfs_meta_t*m,ntag_t*t){(void)n;(void)m;(void)t;return NTAG_215;}
static void mui_view_dispatcher_switch_to_view(void*p,int v){(void)p;current_view=v;}
static void mui_scene_dispatcher_next_scene(void*p,int v){(void)p;current_scene=v;}
static void *mui(void){return NULL;}
static void mui_update(void*p){(void)p;}
'''


def nfc_code(src):
    prefix = (HERE / 'nfc_lifecycle_host.c').read_text().split('/* ACTUAL_SOURCE */')[0]
    engine = re.sub(r'(?m)^\s*#include[^\n]*\n', '', (src / 'ntag/ntag_emu_v2.c').read_text())
    return prefix + engine + COMMON + store_functions(src)


SLOT = r'''
#define MAX_SLOT_COUNT 100
typedef struct {uint8_t focus,max_ntags;int game;} amiibo_view_t;
typedef struct {ntag_t ntag;bool temporary_tag_changed;uint8_t cur_slot_index;amiibo_view_t*p_amiibo_view;} app_amiidb_t;
typedef struct {uint8_t amiidb_data_slot_num;} settings_data_t;
static settings_data_t settings={20};
static settings_data_t *settings_get_data(void){return &settings;}
static bool m_tag_ready,m_active_slot_persist;
static uint8_t m_active_slot;
static void amiibo_view_set_focus(amiibo_view_t*v,uint8_t n){v->focus=n;}
static uint8_t amiibo_view_get_focus(amiibo_view_t*v){return v->focus;}
static void amiibo_view_set_max_ntags(amiibo_view_t*v,uint8_t n){v->max_ntags=n;}
static void amiibo_view_set_game_id(amiibo_view_t*v,int n){v->game=n;}
static void amiidb_scene_amiibo_detail_error_msg(app_amiidb_t*a,const char*m){(void)a;(void)m;errors++;current_view=2;}
static bool fail_save;
static void prior_owner(ntag_event_type_t t,void*c,ntag_t*n){(void)t;(void)c;(void)n;if(fail_save)ntag_emu_save_failed();}
/*ACTUAL_SLOT*/
int main(int argc,char**argv){
 CHECK(argc==2);int scenario=atoi(argv[1]);bool update=scenario&1,failed=scenario<2,guard=scenario>=4;
 amiibo_view_t view={5,20,-1};app_amiidb_t app={.ntag=default_ntag215,.cur_slot_index=5,.p_amiibo_view=&view};
 app.ntag.data[16]=0x44;app.ntag.read_only=true;strcpy(app.ntag.notes,"prior slot");ntag_t before=app.ntag;
 m_active_slot=3;m_active_slot_persist=false;m_tag_ready=true;
 CHECK(ntag_emu_set_tag(&app.ntag)&&ntag_emu_set_update_cb(prior_owner,&app));
 uint32_t generation=ntag_emu.generation;
 rng_fail_at=failed?1:0;
 if(guard){fail_save=true;ntag_emu.dirty=true;ntag_emu.pending=true;}
 if(update)amiidb_scene_amiibo_data_list_update(&app);else amiidb_scene_amiibo_data_list_init(&app);
 if(failed||guard){
  CHECK(!memcmp(&app.ntag,&before,sizeof(before))&&!memcmp(&ntag_emu.ntag,&before,sizeof(before)));
  CHECK(m_active_slot==3&&!m_active_slot_persist&&ntag_emu.generation==generation&&ntag_emu.paused);
  CHECK(errors==(int)failed&&m_tag_ready==!failed);
  if(update)CHECK(view.focus==3);
  CHECK(rng_calls==(unsigned)failed&&!file_reads);
 }else{
  CHECK(!errors&&m_active_slot==5&&m_active_slot_persist&&rng_calls==1&&!ntag_emu.paused);
  CHECK(app.ntag.data[0]==4&&!app.ntag.read_only&&view.focus==5);
  CHECK(!memcmp(&app.ntag,&ntag_emu.ntag,sizeof(app.ntag))&&ntag_emu.generation==generation+1);
 }
 printf("PASS actual slot API + NFC engine RNG case %d\n",scenario);return 0;
}
'''


def slot_code(src):
    api = (src / 'app/amiidb/api/amiidb_api_slot.c').read_text()
    scene = (src / 'app/amiidb/scene/amiidb_scene_amiibo_detail.c').read_text()
    pieces = [actual(api, 'amiidb_api_slot_read')]
    pieces += [actual(scene, name) for name in ['amiidb_scene_amiibo_data_list_init', 'amiidb_scene_amiibo_data_list_update']]
    return nfc_code(src) + SLOT.replace('/*ACTUAL_SLOT*/', '\n'.join(pieces))


LINK = r'''
#define DEFAULT_NTAG_INDEX 99
#define MAX_NTAG_INDEX 26
#define AMIIBOLINK_SCENE_MENU 8
#define AMIIBOLINK_VIEW_ID_MAIN 1
#define AMIIBOLINK_VIEW_ID_MSG_BOX 2
#define MUI_MSG_BOX_EVENT_SELECT_CENTER 1
#define AMIIBOLINK_VIEW_EVENT_MENU 1
#define AMIIBOLINK_VIEW_EVENT_UPDATE 2
#define _L_ERR 1
#define _L_FAILED 2
#define _L_BACK 3
#define APP_TIMER_TICKS(n) (n)
#define APP_TIMER_MODE_SINGLE_SHOT 0
#define BLE_DEVICE_MODE_AMIIBOLINK_V2 1
#define BLE_DEVICE_MODE_AMIIBOLINK 2
#define BLE_DEVICE_MODE_AMILOOP 3
typedef int mui_msg_box_event_t;
typedef int amiibolink_view_event_t;
typedef struct {void*user_data;} mui_msg_box_t;
typedef struct {uint8_t index,max_size;ble_amiibolink_mode_t mode;void*user_data;} amiibolink_view_t;
typedef struct {amiibolink_view_t*p_amiibolink_view;mui_msg_box_t*p_msg_box;void*p_view_dispatcher,*p_scene_dispatcher;ble_amiibolink_mode_t amiibolink_mode;} app_amiibolink_t;
typedef struct {ble_amiibolink_mode_t amiibolink_mode;ble_amiibolink_ver_t amiibo_link_ver;} settings_data_t;
static settings_data_t settings;
static int m_amiibo_gen_delay_timer;
static uint32_t m_generate_generation;
static uint8_t m_active_index;
static ble_amiibolink_mode_t m_active_mode,ble_mode;
static void (*dialog_cb)(mui_msg_box_event_t,mui_msg_box_t*);
static const char *getLangString(int n){(void)n;return "Failed";}
static void mui_msg_box_set_header(void*p,const char*s){(void)p;(void)s;}
static void mui_msg_box_set_message(void*p,const char*s){(void)p;(void)s;++errors;}
static void mui_msg_box_set_btn_text(void*p,const char*a,const char*b,const char*c){(void)p;(void)a;(void)b;(void)c;}
static void mui_msg_box_set_btn_focus(void*p,int n){(void)p;(void)n;}
static void mui_msg_box_set_event_cb(void*p,void(*cb)(mui_msg_box_event_t,mui_msg_box_t*)){(void)p;dialog_cb=cb;}
static void amiibolink_view_set_index(amiibolink_view_t*v,uint8_t n){v->index=n;}
static uint8_t amiibolink_view_get_index(amiibolink_view_t*v){return v->index;}
static void amiibolink_view_set_max_size(amiibolink_view_t*v,uint8_t n){v->max_size=n;}
static void amiibolink_view_set_amiibolink_mode(amiibolink_view_t*v,ble_amiibolink_mode_t n){v->mode=n;}
static void amiibolink_view_set_event_cb(amiibolink_view_t*v,void(*cb)(amiibolink_view_event_t,amiibolink_view_t*)){(void)v;(void)cb;}
static settings_data_t *settings_get_data(void){return &settings;}
static void ble_init(void){}
static void ble_adv_start(void){}
static void ble_device_mode_prepare(uint8_t n){(void)n;}
void ble_amiibolink_set_version(ble_amiibolink_ver_t n){(void)n;}
void ble_amiibolink_set_mode(ble_amiibolink_mode_t n){ble_mode=n;}
void ble_amiibolink_init(void){}
void ble_amiibolink_received_data(const uint8_t*p,size_t n){(void)p;(void)n;}
void ble_amiibolink_set_event_handler(ble_amiibolink_event_handler_t cb,void*p){(void)cb;(void)p;}
static void ble_nus_set_handler(void(*cb)(const uint8_t*,size_t),void*p){(void)cb;(void)p;}
static void amiibo_helper_try_load_amiibo_keys_from_vfs(void){}
static void app_timer_stop(int n){(void)n;}
static void app_timer_start(int n,int ticks,void*p){(void)n;(void)ticks;(void)p;}
static int app_timer_create(int*p,int mode,void(*cb)(void*)){(void)p;(void)mode;(void)cb;return 0;}
static void ntag_generate_timer_request(void*p){(void)p;}
static ret_code_t ntag_store_read(uint8_t index,ntag_t*n){(void)index;if(read_result<0)return 19;*n=default_ntag215;n->data[16]=0x66;return 0;}
static ret_code_t ntag_store_write(uint8_t index,ntag_t*n){(void)index;(void)n;return write_result==NTAG_DATA_SIZE?0:19;}
/*ACTUAL_LINK*/
int main(int argc,char**argv){
 CHECK(argc==2);int scenario=atoi(argv[1]);
 amiibolink_view_t view={4,26,BLE_AMIIBOLINK_MODE_CYCLE,NULL};mui_msg_box_t box={0};
 app_amiibolink_t app={&view,&box,NULL,NULL,BLE_AMIIBOLINK_MODE_CYCLE};view.user_data=box.user_data=&app;
 settings=(settings_data_t){BLE_AMIIBOLINK_MODE_CYCLE,BLE_AMIIBOLINK_VER_V2};
 m_active_index=4;m_active_mode=ble_mode=BLE_AMIIBOLINK_MODE_CYCLE;
 ntag_t old=default_ntag215;old.data[16]=0x44;
 CHECK(ntag_emu_set_tag(&old)&&ntag_emu_set_update_cb(ntag_update_cb,&app));
 uint32_t generation=ntag_emu.generation;current_view=1;
#ifdef SLOT_RESULT_CHECKS
 /* Direct reload entry: failed pending save cannot touch the next slot;
  * success/retry must save the old owner's tag before reading the new one. */
 if(scenario >= 21 && scenario <= 23){
  ntag_emu.dirty=true;ntag_emu.pending=true;view.index=6;
  write_result=scenario==21?NTAG_DATA_SIZE:VFS_ERR_FAIL;
  if(scenario==21){
   require_saved_before_read=true;
   CHECK(ntag_reload(&app,6));
   CHECK(file_writes==1 && file_reads==1 && !ntag_emu_save_pending());
  }else{
   CHECK(!ntag_reload(&app,6));
   CHECK(file_writes==1 && !file_reads && !rng_calls && ntag_emu_save_pending());
   CHECK(!memcmp(&ntag_emu.ntag,&old,sizeof(old)) && m_active_index==4 && view.index==4);
   CHECK(ntag_emu.cb_context==&app && ntag_emu.generation==generation);
   if(scenario==22){
    write_result=NTAG_DATA_SIZE;
    CHECK(ntag_reload(&app,6));
    CHECK(file_writes==2 && file_reads==1 && !ntag_emu_save_pending());
   }else{
    /* Only this explicit discard authorizes dropping the failed pending RAM. */
    CHECK(ntag_emu_discard_changes());
    CHECK(ntag_reload(&app,6));
    CHECK(file_writes==1 && file_reads==1 && !ntag_emu_save_pending());
   }
  }
  CHECK(m_active_index==6 && m_active_mode==BLE_AMIIBOLINK_MODE_CYCLE);
  CHECK(ntag_emu.ntag.data[16]==0x66 && !ntag_emu.paused && ntag_emu.cb_context==&app);
  printf("PASS direct reload pending-save/owner case %d\n",scenario);
  return 0;
 }
 if(scenario >= 11){
  const int file_results[]={0,1,NTAG_DATA_SIZE-1,NTAG_DATA_SIZE+1,572,2048,VFS_ERR_FAIL,VFS_ERR_CRPT,VFS_ERR_NODEV,VFS_ERR_NOMEM};
  CHECK((unsigned)(scenario-11)<sizeof(file_results)/sizeof(file_results[0]));
  read_result=file_results[scenario-11];copied_partial=read_result<0;view.index=6;
  CHECK(!ntag_reload(&app,6));
  CHECK(file_reads==1 && !file_writes && !rng_calls && errors==1);
  CHECK(!memcmp(&ntag_emu.ntag,&old,sizeof(old)) && ntag_emu.paused && ntag_emu.generation==generation);
  CHECK(view.index==4 && m_active_index==4 && m_active_mode==BLE_AMIIBOLINK_MODE_CYCLE);
  read_result=NTAG_DATA_SIZE;copied_partial=false;
  CHECK(ntag_reload(&app,6) && m_active_index==6 && !ntag_emu.paused && ntag_emu.ntag.data[16]==0x66);
  CHECK(!rng_calls && !file_writes);
  return 0;
 }
#endif
 bool failed=scenario==0||scenario==1||scenario==2||scenario==3||scenario==8||scenario==9;
 bool guard=scenario==10;
 if(failed){rng_fail_at=1;read_result=VFS_ERR_NOOBJ;}
 if(scenario==5)read_result=VFS_ERR_NOOBJ;
 if(scenario==3){view.index=0;view.mode=app.amiibolink_mode=m_active_mode=ble_mode=BLE_AMIIBOLINK_MODE_NTAG;m_active_index=99;}
 if(guard){ntag_emu.dirty=true;ntag_emu.pending=true;write_result=VFS_ERR_FAIL;}
 unsigned old_index=m_active_index,old_view=view.index;ble_amiibolink_mode_t old_mode=m_active_mode;
 if(scenario==0||scenario==4||scenario==5){view.index=6;ntag_reload(&app,6);}
 else if(scenario==2||scenario==9){amiibolink_scene_main_on_enter(&app);}
 else if(scenario==6||scenario==7){amiibolink_scene_switch_mode(&app,scenario==6?BLE_AMIIBOLINK_MODE_RANDOM:BLE_AMIIBOLINK_MODE_RANDOM_AUTO_GEN,0);}
 else{amiibolink_scene_switch_mode(&app,scenario==3?BLE_AMIIBOLINK_MODE_CYCLE:BLE_AMIIBOLINK_MODE_NTAG,0);}
 if(failed||guard){
  CHECK(!memcmp(&ntag_emu.ntag,&old,sizeof(old))&&ntag_emu.paused);
  CHECK(m_active_index==old_index&&m_active_mode==old_mode&&app.amiibolink_mode==old_mode&&ble_mode==old_mode&&view.mode==old_mode);
  CHECK(view.index==old_view);
  CHECK(errors==(int)failed);
  if(failed){
   CHECK(current_view==2&&dialog_cb);
   dialog_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER,&box);CHECK(current_scene==AMIIBOLINK_SCENE_MENU);
   if(scenario==8||scenario==9){
    rng_fail_at=0;read_result=NTAG_DATA_SIZE;amiibolink_scene_main_on_enter(&app);
    CHECK(current_view==1&&!ntag_emu.paused&&ntag_emu.ntag.data[16]==0x66);
   }
  }
  if(scenario!=2&&scenario!=8&&scenario!=9)CHECK(ntag_emu.generation==generation);
 }else{
  CHECK(!errors&&!ntag_emu.paused&&ntag_emu.generation>generation);
  if(scenario==4||scenario==5){CHECK(m_active_index==6&&view.index==6);}
  if(scenario==4)CHECK(ntag_emu.ntag.data[16]==0x66);
  if(scenario==5)CHECK(ntag_emu.ntag.data[0]==4&&rng_calls==1);
  if(scenario==6||scenario==7)CHECK(!memcmp(&ntag_emu.ntag,&old,sizeof(old))&&m_active_mode==(scenario==6?1:4)&&ble_mode==m_active_mode&&view.mode==m_active_mode);
 }
 printf("PASS actual AmiiboLink scene + NFC engine case %d\n",scenario);return 0;
}
'''


def link_code(src, internal=False):
    source = (src / 'app/amiibolink/scene/amiibolink_scene_main.c').read_text()
    branch = source.split('#ifdef INTERNAL_ENABLE', 1)[1].split('#endif', 1)[0].split('#else', 1)[0 if internal else 1]
    names = ['ntag_reload_error_back', 'ntag_reload_error'] if 'static void ntag_reload_error(' in source else []
    pieces = [actual(source, name) for name in names]
    pieces.append(actual(branch, 'ntag_update'))
    # LCD separates pending-save delivery from the large next-tag frame.
    # Compile the actual helper as well; all existing RNG/error/owner cases
    # still pass through the production ntag_reload entry point.
    if 'static bool ntag_reload_prepared(' in branch:
        pieces.append(actual(branch, 'ntag_reload_prepared'))
    pieces += [actual(branch, name) for name in ['ntag_reload', 'ntag_init']]
    pieces += [actual(source, name) for name in ['ntag_save_error', 'ntag_update_cb', 'amiibolink_scene_main_event_cb',
               'amiibolink_scene_switch_mode', 'amiibolink_scene_ble_event_handler', 'amiibolink_scene_main_on_enter']]
    tag_result_checks = '#define SLOT_RESULT_CHECKS 1\n' if not internal and 'static bool ntag_reload(' in branch else ''
    return nfc_code(src) + '\n' + (src / 'mod/ble/ble_amiibolink.h').read_text() + tag_result_checks + LINK.replace('/*ACTUAL_LINK*/', '\n'.join(pieces))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fw', type=Path, default=HERE.parents[1])
    parser.add_argument('--out', type=Path)
    parser.add_argument('--expect-original-failures', action='store_true')
    args = parser.parse_args()
    temporary = tempfile.TemporaryDirectory(prefix='standard-tag-rng-') if args.out is None else None
    if temporary is not None:
        args.out = Path(temporary.name)
    args.out.mkdir(parents=True, exist_ok=True)
    src = args.fw.resolve() / 'application/src'
    (args.out / 'boards.h').write_text('')
    cases = []
    for name, code, scenarios, negatives in [
        ('file', file_code(src), range(5), {0,2,3}),
        ('slot', slot_code(src), range(6), {0,1}),
        ('link_external', link_code(src), range(11 if args.expect_original_failures else 24), {0,1,2,3,8,9}),
        ('link_internal', link_code(src, True), [0,1,2,3,4,6,7,8,9,10], {0,1,2,3,8,9}),
    ]:
        cfile=args.out/(name+'.c');cfile.write_text(code)
        binary=args.out/name
        cmd=['gcc','-std=c11','-O1','-g','-Wall','-Wextra','-Werror','-Wno-unused-function',
             '-Wno-unused-parameter','-Wno-unused-variable','-Wno-pointer-sign','-Wno-format-extra-args',
             '-fno-pie','-no-pie','-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer',
             '-I',str(args.out),'-I',str(src/'ntag'),'-I',str(src/'mod/vfs'),str(cfile),'-o',str(binary)]
        built=subprocess.run(cmd,capture_output=True,text=True,timeout=60)
        (args.out/(name+'_build.log')).write_text(built.stdout+built.stderr)
        if built.returncode:raise RuntimeError(name+'\n'+built.stdout+built.stderr)
        for scenario in scenarios:
            ran=subprocess.run([str(binary),str(scenario)],capture_output=True,text=True,timeout=15,
                               env=dict(os.environ,ASAN_OPTIONS='detect_leaks=0'))
            expected=71 if args.expect_original_failures and scenario in negatives else 0
            cases.append(dict(test=name,scenario=scenario,expected=expected,returncode=ran.returncode,
                              passed=ran.returncode==expected,stdout=ran.stdout,stderr=ran.stderr))
    report=dict(passed=all(c['passed'] for c in cases),negative_control=args.expect_original_failures,
                cases=cases,device_access=False,sanitizers=['address','undefined'],leak_sanitizer=False,
                limits=['Actual source callbacks and NFC engine; RNG, storage and radio HAL are injected.',
                        'No physical NFC, device UI, latency or ARM build/stack measurement.'])
    (args.out/'RESULTS.json').write_text(json.dumps(report,indent=2)+'\n')
    print(f"{'PASS' if report['passed'] else 'FAIL'} {len(cases)} standard-tag creation cases; "
          f"{sum(c['returncode']==71 for c in cases)} original failures reproduced")
    if not report['passed']:
        for case in cases:
            if not case['passed']:print(case)
        raise SystemExit(1)


if __name__ == '__main__':
    main()
