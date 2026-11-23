"""Actual LCD NTAG engine and App2/App3 completion callbacks; deterministic UI/storage seams."""
import re
from pathlib import Path

from test_nfc_save_retry_de337 import HERE, SRC, run
from test_nfc_lifecycle_de3_3 import function


COMMON = r'''
#define APP_TIMER_TICKS(n) (n)
#define VFS_OK 0
#define ICON_FILE 1
#define MUI_SCENE_STACK_CAPACITY 8
enum {LIST=1,FAV=2,DATA=3,DETAIL=4,OTHER=5};
#define AMIIBO_SCENE_AMIIBO_DETAIL DETAIL
#define AMIIBO_SCENE_FILE_BROWSER LIST
#define AMIIDB_SCENE_AMIIBO_DETAIL DETAIL
#define AMIIDB_SCENE_FAV_LIST FAV
#define AMIIDB_SCENE_DATA_LIST DATA
typedef struct {uint32_t head,tail;} db_amiibo_t;
typedef struct {unsigned icon;void*user_data;} mui_list_item_t;
typedef struct {mui_list_item_t rows[12];unsigned count;} rows_t;
typedef struct {rows_t*items;unsigned focus;} mui_list_view_t;
typedef struct {void(*enter_cb)(void*);void(*exit_cb)(void*);} mui_scene_t;
typedef struct {unsigned scene_depth,scene_num,default_scene_id;uint32_t scene_id_stack[8];
 bool(*transition_guard)(void);void*user_data;const mui_scene_t*p_scene_defines;} mui_scene_dispatcher_t;
typedef struct {ntag_t ntag;mui_scene_dispatcher_t*p_scene_dispatcher;mui_list_view_t*p_list_view;
 void*p_toast_view;bool focus_detail_file,temporary_tag_changed;uint8_t prev_scene_id,cur_slot_index;const db_amiibo_t*cur_amiibo;unsigned cur_fav;} app_t;
typedef app_t app_amiibo_t;
typedef app_t app_amiidb_t;
typedef struct {bool auto_gen_amiibo;unsigned amiidb_data_slot_num;} settings_data_t;
static settings_data_t settings;
static settings_data_t*settings_get_data(void){return &settings;}
static bool amiibo_helper_is_key_loaded(void){return true;}
static int m_amiibo_gen_delay_timer;static uint32_t m_generate_generation;
static unsigned timer_starts,returned,saved,focus_calls;static bool save_error,veto;
static void app_timer_stop(int t){(void)t;}
static void app_timer_start(int t,int n,void*p){(void)t;(void)n;(void)p;timer_starts++;}
static void*mui(void){return NULL;}
static void mui_update(void*p){(void)p;}
static void mui_show_memory_error(void*p){(void)p;assert(false);}
static unsigned mui_list_view_item_size(mui_list_view_t*p){return p->items->count;}
static unsigned mui_list_view_get_focus(mui_list_view_t*p){return p->focus;}
static void mui_list_view_set_focus(mui_list_view_t*p,unsigned n){assert(n<p->items->count);p->focus=n;focus_calls++;}
static const mui_list_item_t*mui_list_item_array_get(rows_t*p,unsigned n){assert(n<p->count);return &p->rows[n];}
static bool amiidb_fav_page_focus(app_t*app,const unsigned*fav){assert(fav==&app->cur_fav);mui_list_view_set_focus(app->p_list_view,2);return true;}
static int amiidb_api_slot_update(unsigned n,ntag_t*tag){assert(n==3&&tag->data[16]==0x55);saved++;return save_error?-5:0;}
static void ntag_update(app_t*app,ntag_t*tag){app->ntag=*tag;saved++;if(save_error)ntag_emu_save_failed();}
static uint8_t m_active_slot=3;static bool m_active_slot_persist=true;
#define _T(x) #x
static void mui_toast_view_show(void*v,const char*m){(void)v;(void)m;}
static int amiidb_api_slot_write(unsigned slot,ntag_t*tag){assert(slot==3&&tag->data[16]==0x55);saved++;return save_error?-5:0;}
'''

MAIN = r'''
static const db_amiibo_t figures[]={{1,1},{2,2}};
static void parent_enter(void*p){
 app_t*app=p;unsigned parent=mui_scene_dispatcher_current_scene(app->p_scene_dispatcher);
 returned++;app->p_list_view->items->count=parent==DATA?9:3;app->p_list_view->focus=0;
 for(unsigned i=0;i<3;i++)app->p_list_view->items->rows[i]=(mui_list_item_t){ICON_FILE,(void*)&figures[i%2]};
 if(APP_KIND==2){assert(app->focus_detail_file);app->p_list_view->focus=1;}
}
static void detail_enter(void*p){assert(ntag_emu_set_update_cb(ntag_update_cb,p));}
static void detail_exit(void*p){(void)p;assert(ntag_emu_set_update_cb(NULL,NULL));}
static bool guard(void){return !veto&&ntag_emu_prepare_change();}
int main(void){
 unsigned cases=0;
 for(unsigned parent=LIST;parent<=(APP_KIND==2?LIST:DATA);parent++)for(unsigned kind=0;kind<(APP_KIND==3&&parent!=DATA?19u:13u);kind++){
  memset(&ntag_emu,0,sizeof(ntag_emu));timer_starts=returned=saved=focus_calls=0;save_error=veto=false;
  m_active_slot_persist=kind<13;
  settings=(settings_data_t){.auto_gen_amiibo=kind==5,.amiidb_data_slot_num=8};
  rows_t rows={0};mui_list_view_t list={.items=&rows};mui_scene_t scenes[6]={0};
  for(unsigned n=LIST;n<=DATA;n++)scenes[n].enter_cb=parent_enter;scenes[DETAIL].enter_cb=detail_enter;scenes[DETAIL].exit_cb=detail_exit;
  mui_scene_dispatcher_t dispatcher={.scene_depth=2,.scene_num=6,.scene_id_stack={parent,DETAIL},.p_scene_defines=scenes,.transition_guard=guard};
  app_t app={.p_scene_dispatcher=&dispatcher,.p_list_view=&list,.prev_scene_id=parent,.cur_slot_index=3,.cur_amiibo=&figures[1]};
  app.ntag.type=NTAG_215;app.ntag.data[16]=0x11;dispatcher.user_data=&app;
  assert(ntag_emu_set_tag(&app.ntag)&&ntag_emu_set_update_cb(ntag_update_cb,&app));
  nfc_callback(NULL,HAL_NFC_EVENT_FIELD_ON,NULL,0);
  bool write=kind==1||kind==6||kind==13||kind==14||kind==15||kind==17;save_error=kind==6;
  const uint8_t read[]={NFC_CMD_READ,0},invalid[]={NFC_CMD_READ,255},version[]={NFC_CMD_GET_VERSION};
  const uint8_t written[]={NFC_CMD_WRITE,kind==17?21:4,0x55,0x55,0x55,0x55};
  if(write)nfc_callback(NULL,HAL_NFC_EVENT_COMMAND,written,sizeof(written));
  else if(kind!=2)nfc_callback(NULL,HAL_NFC_EVENT_COMMAND,kind==4?invalid:kind==12?version:read,kind==12?sizeof(version):sizeof(read));
  if(kind!=3)nfc_callback(NULL,HAL_NFC_EVENT_DATA_TRANSMITTED,NULL,0);
  assert(!ntag_emu_session_used());
  nfc_callback(NULL,HAL_NFC_EVENT_FIELD_OFF,NULL,0);
  ntag_emu_deliver(false);assert(returned==0);
  if(kind==7)nfc_callback(NULL,HAL_NFC_EVENT_FIELD_ON,NULL,0);
  if(kind==8)assert(ntag_emu_set_update_cb(NULL,NULL));
  if(kind==9)assert(ntag_emu_set_tag(&app.ntag));
  if(kind==10)dispatcher.scene_id_stack[1]=OTHER;
  if(kind==11)veto=true;
  if(kind==18)inject_write_after_session_check=true;
  if(kind==16)app.temporary_tag_changed=true; /* Also recheck an already queued action. */
  ntag_emu_process_pending();
  bool expected=kind==0||kind==1;
  assert(returned==expected&&!app.focus_detail_file);
  if(expected){assert(mui_scene_dispatcher_current_scene(&dispatcher)==parent&&dispatcher.scene_depth==1);
   assert(list.focus==(APP_KIND==2?1:parent==FAV?2:parent==DATA?3:1));
   assert(ntag_emu.cb_context==NULL);}
  else assert(dispatcher.scene_depth==2);
  if(kind==5)assert(timer_starts==1);
  if(kind==6){assert(saved==1&&ntag_emu_save_pending()&&ntag_emu.ntag.data[16]==0x55);
   for(unsigned i=0;i<3;i++)ntag_emu_process_pending();assert(saved==1&&!returned);
   save_error=false;assert(ntag_emu_retry_save());assert(saved==2&&!returned&&!ntag_emu_session_used());}
#if APP_KIND == 3
  if(kind==13||kind==14||kind==15||kind==17||kind==18){
   assert(app.temporary_tag_changed&&saved==0&&!ntag_emu_save_pending());
   assert(app.ntag.data[kind==17?84:16]==0x55);
   if(kind==14||kind==15){save_error=kind==14;save_to_slot(&app,3);assert(saved==1);assert(app.temporary_tag_changed==(kind==14));}
   nfc_callback(NULL,HAL_NFC_EVENT_FIELD_ON,NULL,0);
   nfc_callback(NULL,HAL_NFC_EVENT_COMMAND,read,sizeof(read));
   nfc_callback(NULL,HAL_NFC_EVENT_DATA_TRANSMITTED,NULL,0);
   nfc_callback(NULL,HAL_NFC_EVENT_FIELD_OFF,NULL,0);ntag_emu_process_pending();
   expected=kind==15;assert(returned==expected);
   if(!expected){assert(app.temporary_tag_changed&&dispatcher.scene_depth==2);assert(app.ntag.data[kind==17?84:16]==0x55);}
  }
#endif
  ntag_emu_process_pending();assert(returned==expected);cases++;
 }
 printf("PASS App%u: %u actual engine/callback/scene-return cases; byte writes/save errors, empty field, unsent/invalid reads, auto-UID, owner/tag/scene changes and veto\n",APP_KIND,cases);
}
'''


def main():
    prefix = (HERE / 'nfc_lifecycle_host.c').read_text().split('/* ACTUAL_SOURCE */')[0]
    engine = re.sub(r'(?m)^\s*#include[^\n]*\n', '', (SRC / 'ntag/ntag_emu_v2.c').read_text())
    dispatcher = (SRC / 'mui/mui_scene_dispatcher.c').read_text()
    dispatch = '\n'.join(function(dispatcher, n) for n in ('mui_scene_dispatcher_next_scene', 'mui_scene_dispatcher_current_scene'))
    for kind, app in ((2, 'amiibo'), (3, 'amiidb')):
        scene = (SRC / f'app/{app}/scene/{app}_scene_amiibo_detail.c').read_text()
        # Inject an actual IRQ WRITE after the action's session observation.
        engine_for_case = engine.replace('bool ntag_emu_session_used(void)', 'bool raw_ntag_emu_session_used(void)')
        interleave = r'''
static bool inject_write_after_session_check;
static bool ntag_emu_session_used(void){
 bool used=raw_ntag_emu_session_used();
 if(used&&inject_write_after_session_check){
  inject_write_after_session_check=false;
  const uint8_t bytes[]={NFC_CMD_WRITE,4,0x55,0x55,0x55,0x55};
  nfc_callback(NULL,HAL_NFC_EVENT_COMMAND,bytes,sizeof(bytes));
 }
 return used;
}
'''
        code = prefix + engine_for_case + interleave + COMMON + dispatch
        if kind == 3:
            menu = (SRC / 'app/amiidb/scene/amiidb_scene_amiibo_detail_menu.c').read_text()
            code += function(menu, 'amiidb_scene_detail_back_to_list')
            select = (SRC / 'app/amiidb/scene/amiidb_scene_data_select.c').read_text()
            code += function(select, 'save_to_slot')
        code += function(scene, app + '_nfc_return_to_list') + function(scene, 'ntag_update_cb')
        run(f'App{kind} completed NFC return', code + MAIN, extra_cflags=('-DBOARD_LCD=1', f'-DAPP_KIND={kind}', '-Wno-misleading-indentation'))


if __name__ == '__main__':
    main()
