"""Real NTAG engine and production persistence callbacks; injected I/O/NOSPC errors.
No device or flash access. Dirty RAM survives ownership/slot/scene failures.
"""
from pathlib import Path
import os,re,subprocess,tempfile,shutil
from test_nfc_lifecycle_de3_3 import function
HERE=Path(__file__).resolve().parent
SRC=HERE.parents[1]/"application/src"

def run(name,code,args=(),extra_cflags=()):
    with tempfile.TemporaryDirectory(prefix="nfc-retry-") as tmp:
        p=Path(tmp)/"case.c";p.write_text(code,encoding="utf-8")
        exe=Path(tmp)/("case.exe" if os.name=="nt" else "case")
        cmd=[shutil.which("gcc"),"-std=c11","-O1","-g","-Wall","-Wextra","-Werror",
          "-Wno-unused-function","-Wno-unused-variable","-Wno-unused-parameter","-I",str(SRC/"ntag"),str(p),"-o",str(exe)]
        if os.environ.get("PIXL_SANITIZE")=="1":cmd += ["-fsanitize=address,undefined","-fno-omit-frame-pointer","-no-pie"]
        cmd += list(extra_cflags)
        subprocess.run(cmd,check=True,timeout=60)
        subprocess.run([str(exe),*args],check=True,timeout=30)
        print("PASS",name)

def declaration(source,name):
    match=re.search(r'^\s*(?:static\s+)?(?:bool|void|uint8_t)\s+'+re.escape(name)+r'\([^;]*?\)\s*\{',source,re.M)
    assert match,name
    depth,end=1,match.end()
    while depth:
        depth+=(source[end]=='{')-(source[end]=='}');end+=1
    return source[match.start():end]

def main():
    prefix=(HERE/"nfc_lifecycle_host.c").read_text().split("/* ACTUAL_SOURCE */")[0]
    engine=re.sub(r"(?m)^\s*#include[^\n]*\n","",(SRC/"ntag/ntag_emu_v2.c").read_text())
    scene=(SRC/"app/amiidb/scene/amiidb_scene_amiibo_detail.c").read_text()
    code=prefix+engine+r'''
typedef struct {ntag_t ntag;void *p_amiibo_view,*p_toast_view;} app_amiidb_t;
typedef struct {bool auto_gen_amiibo;} settings_data_t;
static settings_data_t settings;
static settings_data_t *settings_get_data(void){return &settings;}
static bool amiibo_helper_is_key_loaded(void){return true;}
static unsigned save_calls,errors,reads;
static int save_result,focus=8;
static uint8_t persisted=0x11;
static int m_amiibo_gen_delay_timer=1;
static uint32_t m_generate_generation;
static uint8_t m_active_slot=2;
static bool m_active_slot_persist=true,m_tag_ready=true;
static void app_timer_stop(int timer){assert(timer==1);}
static void app_timer_start(int timer,int ticks,void*ctx){(void)timer;(void)ticks;(void)ctx;}
#define APP_TIMER_TICKS(n) (n)
#define VFS_OK 0
#define VFS_ERR_NOOBJ -1
#define DE3_STORAGE_IO_ERROR 1
#define APP_AMIIDB_SLOT_SAVE_FAILED 2
#define _T(x) x
static void *mui(void){return NULL;}
static void mui_update(void*p){(void)p;}
static void mui_toast_view_show(void*p,int text){(void)p;assert(text==APP_AMIIDB_SLOT_SAVE_FAILED);errors++;}
static uint8_t amiibo_view_get_focus(void*p){(void)p;return (uint8_t)focus;}
static void amiibo_view_set_focus(void*p,uint8_t f){(void)p;focus=f;}
static int amiidb_api_slot_write(uint8_t slot,ntag_t*tag){
 assert(slot==2);save_calls++;if(!save_result)persisted=tag->data[16];return save_result;
}
static int amiidb_api_slot_read(uint8_t slot,ntag_t*tag){
 assert(slot==8);reads++;memset(tag,0,sizeof(*tag));tag->type=NTAG_215;tag->data[16]=0x88;return 0;
}
static void ntag_store_new_rand(ntag_t*tag){memset(tag,0,sizeof(*tag));tag->type=NTAG_215;}
static void amiidb_scene_amiibo_detail_error_msg(app_amiidb_t*app,int text){(void)app;(void)text;errors++;}
'''+function(scene,"ntag_update_cb")+function(scene,"amiidb_scene_amiibo_data_list_update")+r'''
static void pump(void){for(unsigned i=0;i<1000;i++){nfc_callback(NULL,HAL_NFC_EVENT_FIELD_OFF,NULL,0);ntag_emu_process_pending();}}
int main(void){
 const int results[]={0,-28,-5};
 for(unsigned via_field=0;via_field<2;via_field++)for(unsigned k=0;k<3;k++){
  memset(&ntag_emu,0,sizeof(ntag_emu));app_amiidb_t app={0};app.ntag.type=NTAG_215;app.ntag.data[16]=0x11;
  save_result=results[k];save_calls=errors=reads=0;persisted=0x11;m_active_slot=2;m_active_slot_persist=true;focus=8;
  assert(ntag_emu_set_tag(&app.ntag));assert(ntag_emu_set_update_cb(ntag_update_cb,&app));
  const uint8_t write[]={NFC_CMD_WRITE,4,0x55,0x55,0x55,0x55};
  nfc_callback(NULL,HAL_NFC_EVENT_COMMAND,write,sizeof(write));assert(ack==0xA&&ntag_emu.dirty);
  if(via_field){nfc_callback(NULL,HAL_NFC_EVENT_FIELD_OFF,NULL,0);ntag_emu_process_pending();}
  else amiidb_scene_amiibo_data_list_update(&app);
  if(!save_result){
   assert(save_calls==1&&persisted==0x55&&!ntag_emu.dirty&&!ntag_emu_save_pending());
   if(!via_field)assert(reads==1&&m_active_slot==8&&ntag_emu.ntag.data[16]==0x88);
   continue;
  }
  assert(save_calls==1&&ntag_emu_save_pending()&&!reads&&m_active_slot==2&&ntag_emu_save_pending());
  assert(ntag_emu.ntag.data[16]==0x55&&app.ntag.data[16]==0x55&&persisted==0x11);
  pump();assert(save_calls==1); /* No retry storm from field loss or main loop. */
  nfc_callback(NULL,HAL_NFC_EVENT_COMMAND,write,sizeof(write));assert(ack==0);
  assert(!ntag_emu_set_update_cb(NULL,NULL));assert(save_calls==2&&ntag_emu.cb_context==&app);
  ntag_t other={0};assert(!ntag_emu_set_tag(&other));assert(save_calls==3&&ntag_emu.ntag.data[16]==0x55);
  assert(ntag_emu_init(&other)==NRF_ERROR_BUSY);assert(!stop_count);
  ntag_emu_uninit();assert(!stop_count&&ntag_emu.cb_context==&app);
  for(unsigned retry=0;retry<3;retry++){
   unsigned old=save_calls;focus=8;amiidb_scene_amiibo_data_list_update(&app);
   assert(save_calls==old+1&&!reads&&focus==2&&ntag_emu.ntag.data[16]==0x55);pump();assert(save_calls==old+1);
  }
  save_result=0;focus=8;amiidb_scene_amiibo_data_list_update(&app);
  assert(persisted==0x55&&reads==1&&m_active_slot==8&&!ntag_emu_save_pending()&&!ntag_emu.dirty);
  assert(ntag_emu.ntag.data[16]==0x88);unsigned old=save_calls;pump();assert(save_calls==old);
 }
 puts("real engine + slot callback: NOSPC/IO; field-off and UI transitions; retained bytes, explicit retries, no repeated pump writes, focus rollback");
 return 0;
}
'''
    run("database dirty retention and retry",code)
    link=(SRC/"app/amiibolink/scene/amiibolink_scene_main.c").read_text()
    base=prefix+engine+r'''
typedef struct {unsigned index,max_size;} amiibolink_view_t;
typedef struct {amiibolink_view_t *p_amiibolink_view;int amiibolink_mode;} app_amiibolink_t;
#define BLE_AMIIBOLINK_MODE_RANDOM 1
#define BLE_AMIIBOLINK_MODE_RANDOM_AUTO_GEN 2
#define BLE_AMIIBOLINK_MODE_CYCLE 3
#define BLE_AMIIBOLINK_MODE_NTAG 4
#define DEFAULT_NTAG_INDEX 99
#define BLE_AMIIBOLINK_EVENT_TAG_UPDATED 1
#define BLE_AMIIBOLINK_EVENT_SET_MODE 2
#define APP_TIMER_TICKS(n) (n)
typedef int ble_amiibolink_mode_t;
typedef int ble_amiibolink_event_type_t;
typedef struct {int amiibolink_mode;} settings_data_t;
static settings_data_t settings;
static settings_data_t *settings_get_data(void){return &settings;}
static uint8_t m_active_index=5;static int m_active_mode=3;
static unsigned writes,errors,reloads;static bool fail=true;static uint8_t persisted;
static int m_amiibo_gen_delay_timer;
static uint32_t m_generate_generation;
static void app_timer_stop(int t){(void)t;}
static void app_timer_start(int t,int k,void*p){(void)t;(void)k;(void)p;}
static void *mui(void){return NULL;}
static void mui_update(void*p){(void)p;}
static void ntag_save_error(app_amiibolink_t*app){(void)app;errors++;ntag_emu_save_failed();}
static bool ntag_update(app_amiibolink_t*app,uint8_t i,ntag_t*t){(void)app;assert(i==5);writes++;if(!fail)persisted=t->data[16];return !fail;}
static void ntag_reload(app_amiibolink_t*a,uint8_t i){(void)a;(void)i;reloads++;}
static void amiibolink_scene_switch_mode(app_amiibolink_t*a,int m,uint8_t i){(void)a;(void)m;(void)i;}
'''+function(link,"ntag_update_cb")+function(link,"amiibolink_scene_ble_event_handler")+r'''
int main(void){
 amiibolink_view_t view={5,26};app_amiibolink_t app={&view,3};ntag_t tag={.type=NTAG_215};tag.data[16]=0x55;
 ntag_emu_set_tag(&tag);ntag_emu_set_update_cb(ntag_update_cb,&app);
 amiibolink_scene_ble_event_handler(&app,BLE_AMIIBOLINK_EVENT_TAG_UPDATED,(uint8_t *)&tag, sizeof(tag));
 assert(errors==1&&writes==1&&!reloads&&view.index==5&&ntag_emu_save_pending());
 for(unsigned i=0;i<1000;i++){ntag_emu_process_pending();}assert(writes==1);
 assert(!ntag_emu_prepare_change());assert(writes==2&&ntag_emu_save_pending());
 fail=false;assert(ntag_emu_prepare_change());assert(writes==3&&persisted==0x55&&!ntag_emu_save_pending());
 assert(ntag_emu_set_update_cb(ntag_update_cb,&app));assert(!ntag_emu.paused);
 puts("AmiiboLink BLE failed save keeps index/current tag and retries through the same persistence owner");return 0;
}
'''
    run("AmiiboLink failed commit",base)

    transport=(SRC/'mod/ble/ble_amiibolink.c').read_text()
    globals=transport[transport.index('static ntag_t m_ntag'):transport.index('/* The buffer helpers')]
    transport_prefix=prefix+engine+(SRC/'mod/ble/ble_amiibolink.h').read_text()+(SRC/'mod/df/df_buffer.h').read_text()
    transport_prefix += '\n#define MAX_MTU_DAT_SIZE 247\n#define NRF_LOG_WARNING(...) ((void)0)\n#define NRF_LOG_HEXDUMP_DEBUG(...) ((void)0)\nstatic uint8_t ble_tx[247];\nstatic size_t ble_tx_length;\nstatic unsigned ble_tx_count;\nstatic void ble_nus_tx_data(const void *data,size_t length){\n assert(length<=sizeof(ble_tx));memcpy(ble_tx,data,length);ble_tx_length=length;++ble_tx_count;\n}\n'+globals
    actual='\n'.join(declaration(transport,n) for n in ['ble_amiibolink_reset_transfer','link_begin_transfer','link_append','link_commit_transfer','get_xor','amiloop_send_data','ble_amiloop_received_data'])
    transport_test=r'''
#define CHECK(x) do{if(!(x)){fprintf(stderr,"CHECK failed line %d %s\n",__LINE__,#x);return 71;}}while(0)
static unsigned saves,events;
static bool save_fails,begin_from_event;
static uint8_t persisted;
static void cb(ntag_event_type_t t,void*ctx,ntag_t*tag){
 (void)ctx;if(t==NTAG_EVENT_TYPE_WRITTEN){++saves;if(save_fails)ntag_emu_save_failed();else persisted=tag->data[16];}
}
static void event_cb(void*ctx,ble_amiibolink_event_type_t type,uint8_t*data,size_t length){
 assert(ctx==(void*)7&&type==BLE_AMIIBOLINK_EVENT_TAG_UPDATED&&length==sizeof(ntag_t));
 assert(!m_transfer_active&&m_data_pos==0&&index==0);
 assert(((ntag_t*)data)->data[0]==0x42&&ntag_emu.ntag.data[0]==0x42);++events;
 if(begin_from_event){link_begin_transfer();uint8_t next=0x43;assert(link_append(&next,1));index=1;}
}
static void seed(void){
 memset(&ntag_emu,0,sizeof(ntag_emu));ble_amiibolink_reset_transfer();
 saves=events=ble_tx_count=0;ble_tx_length=0;save_fails=true;begin_from_event=false;persisted=0x11;
 ntag_t old={.type=NTAG_215};old.data[0]=0x41;old.data[16]=0x11;
 assert(ntag_emu_set_tag(&old)&&ntag_emu_set_update_cb(cb,NULL));
 const uint8_t write[]={NFC_CMD_WRITE,4,0x55,0x55,0x55,0x55};
 nfc_callback(NULL,HAL_NFC_EVENT_COMMAND,write,sizeof(write));assert(ack==0xA);
 m_event_handler=event_cb;m_event_ctx=(void*)7;
}
static void stage(size_t size){
 uint8_t incoming[NTAG_DATA_SIZE]={0};incoming[0]=0x42;
 link_begin_transfer();assert(link_append(incoming,size));index=4;
}
static void final_packet(void){
 const uint8_t packet[]={0x02,4,0x87,1,5,0x00,0x87,0x03};
 /* checksum: 4 ^ 0x87 ^ 1 ^ 5 ^ 0 == 0x87 */
 ble_amiloop_received_data(packet,sizeof(packet));
}
int main(int argc,char**argv){
 (void)argv;
 if(argc==1){
  seed();stage(540);uint32_t old_generation=ntag_emu.generation;
  CHECK(!link_commit_transfer());
  CHECK(m_transfer_active&&m_data_pos==540&&index==4&&m_ntag.data[0]==0x42);
  CHECK(!events&&saves==1&&ntag_emu.ntag.data[0]==0x41&&ntag_emu.ntag.data[16]==0x55);
  CHECK(ntag_emu_save_pending()&&ntag_emu.dirty&&ntag_emu.generation==old_generation&&persisted==0x11);
  save_fails=false;CHECK(link_commit_transfer());
  CHECK(events==1&&saves==2&&!m_transfer_active&&!m_data_pos&&!index);
  CHECK(ntag_emu.ntag.data[0]==0x42&&!ntag_emu_save_pending()&&!ntag_emu.dirty&&!ntag_emu.paused&&persisted==0x55);
  CHECK(!link_commit_transfer()&&events==1&&saves==2);
  seed();stage(540);save_fails=false;begin_from_event=true;CHECK(link_commit_transfer());
  CHECK(events==1&&m_transfer_active&&m_data_pos==1&&index==1&&m_ntag.data[0]==0x43);
  puts("PASS actual engine/commit: failed save retains old tag and transfer; explicit retry commits once; callback reentrancy keeps new transfer");
 }else{
  seed();stage(539);final_packet();
  CHECK(ble_tx_count==1&&ble_tx_length==5);
  CHECK(ble_tx[2]==0x01); /* Failed commit must not acknowledge success. */
  CHECK(m_transfer_active&&m_data_pos==540&&index==5&&!events&&ntag_emu.ntag.data[0]==0x41&&ntag_emu_save_pending());
  save_fails=false;CHECK(link_commit_transfer());CHECK(events==1&&!m_transfer_active&&!m_data_pos&&!index);
  seed();stage(539);save_fails=false;final_packet();
  CHECK(ble_tx_count==1&&ble_tx_length==5&&ble_tx[2]==0&&events==1&&!m_transfer_active&&!m_data_pos&&!index);
  puts("PASS actual AmiLoop completion reports rejected commit; successful completion and later commit retry remain intact");
 }
 return 0;
}
'''
    # Existing SET_MODE enum-pointer callback predates this test; warnings remain visible.
    flags=['-Wno-sign-compare','-Wno-error=incompatible-pointer-types']
    run('BLE commit keeps rejected transaction',transport_prefix+actual+transport_test,extra_cflags=flags)
    run('AmiLoop rejects failed final commit',transport_prefix+actual+transport_test,args=('amiloop',),extra_cflags=flags)

if __name__=="__main__":main()
