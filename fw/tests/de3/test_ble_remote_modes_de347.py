"""Compile production deferred owner/apply/stop functions against bounded SDK states."""
from pathlib import Path
import os,re,subprocess,tempfile
FW=Path(__file__).resolve().parents[2]
source=(FW/'application/src/mod/ble/ble_main.c').read_text(encoding='utf-8')
def function(name):
    m=re.search(r'^(?:static\s+)?\w+\s+'+name+r'\([^;]*?\)\s*\{',source,re.M);assert m,name
    end=source.index('{',m.start())+1;depth=1
    while depth:depth+=(source[end]=='{')-(source[end]=='}');end+=1
    return source[m.start():end]
code=r'''
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
typedef uint32_t ret_code_t;
typedef void(*nus_rx_data_handler_t)(const uint8_t*,size_t);
typedef void(*nus_tx_ready_handler_t)(void);
typedef enum {BLE_DEVICE_MODE_PIXLJS,BLE_DEVICE_MODE_AMIIBOLINK,BLE_DEVICE_MODE_AMIIBOLINK_V2,BLE_DEVICE_MODE_AMILOOP,BLE_DEVICE_MODE_REMOTE}ble_device_mode_t;
typedef struct {uint8_t addr[6];}ble_gap_addr_t;
typedef struct {unsigned x;}ble_gap_conn_sec_mode_t;
static unsigned critical_depth;
#define CRITICAL_REGION_ENTER() do{critical_depth++;
#define CRITICAL_REGION_EXIT() critical_depth--;}while(0)
#define APP_TIMER_TICKS(n) (n)
#define APP_ERROR_CHECK(n) assert((n)==0)
#define NRF_LOG_INFO(...) ((void)0)
#define NRF_SUCCESS 0
#define NRF_ERROR_BUSY 17
#define NRF_ERROR_INVALID_STATE 8
#define BLE_CONN_HANDLE_INVALID 65535
#define BLE_HCI_REMOTE_USER_TERMINATED_CONNECTION 0x13
#define BLE_ADV_MODE_IDLE 0
#define BLE_ADV_MODE_FAST 1
#define NRF_SDH_BLE_GATT_MAX_MTU_SIZE 250
#define APP_ADV_INTERVAL 40
#define APP_ADV_DURATION 18000
#define APP_BLE_CONN_CFG_TAG 1
#define BLE_ADVDATA_FULL_NAME 1
#define BLE_ADVDATA_NO_NAME 0
#define BLE_GAP_ADV_FLAGS_LE_ONLY_LIMITED_DISC_MODE 5
#define BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE 6
#define DEVICE_NAME_REMOTE "Pixl.Remote"
#define DEVICE_NAME_PIXLJS "Pixl.js"
#define DEVICE_NAME_AMIIBOLINK "amiibolink"
#define DEVICE_NAME_AMILOOP "AmiLoop"
#define BLE_GAP_CONN_SEC_MODE_SET_OPEN(p) ((void)p)
static struct {void *p_adv_data;unsigned adv_mode_current,adv_handle;struct{bool ble_adv_on_disconnect_disabled;}adv_modes_config;}m_advertising;
static unsigned sdk_addr_result,sdk_name_result,sdk_adv_result,sdk_mtu_result,sdk_start_result;
static unsigned addr_calls,name_calls,adv_config_calls,advertised,disconnected,stopped,work_resets,owner_installs;
static unsigned clock_tick,cleanup_calls;
static bool mock_clean,mock_dispatch,mock_reply;
static uint16_t m_conn_handle=65535,m_nus_session_handle=65535,m_release_handle=65535;
static bool m_file_mode,m_remote_mode,m_ble_initialized=true,m_sessions_enabled,m_advertising_active,m_file_join_pending,m_release_attempted,m_release_requested;
static uint32_t m_session_generation;
typedef enum {BLE_REMOTE_INIT_IDLE,BLE_REMOTE_INIT_WAIT,BLE_REMOTE_INIT_ADDRESS,BLE_REMOTE_INIT_NAME,BLE_REMOTE_INIT_MTU,BLE_REMOTE_INIT_ADVDATA,BLE_REMOTE_INIT_START,BLE_REMOTE_INIT_READY}ble_remote_init_phase_t;
static uint8_t m_remote_init_phase;
static uint32_t m_remote_init_result;
static uint8_t m_file_link_handoff;
static ble_gap_addr_t m_default_gap_addr={{0x70,1,2,3,4,5}};
typedef struct {unsigned name_type,flags;bool include_appearance;struct {unsigned uuid_cnt;void *p_uuids;}uuids_complete;}ble_advdata_t;
typedef struct {ble_advdata_t advdata,srdata;
 struct {bool ble_adv_fast_enabled,ble_adv_on_disconnect_disabled;unsigned ble_adv_fast_interval,ble_adv_fast_timeout;}config;
 void(*evt_handler)(void);}ble_advertising_init_t;
static uint16_t m_adv_uuids[1];
static unsigned configured_timeout,configured_flags;
static void on_adv_evt(void){}
static unsigned ble_advertising_init(void *adv,const ble_advertising_init_t *init){(void)adv;assert(init->config.ble_adv_on_disconnect_disabled);configured_timeout=init->config.ble_adv_fast_timeout;configured_flags=init->advdata.flags;adv_config_calls++;
 if(init->advdata.flags==6){assert(init->advdata.name_type==0&&init->srdata.name_type==1&&init->advdata.uuids_complete.uuid_cnt==1&&!init->srdata.uuids_complete.uuid_cnt);}
 else {assert(init->advdata.name_type==1&&init->srdata.name_type==0&&!init->advdata.uuids_complete.uuid_cnt&&init->srdata.uuids_complete.uuid_cnt==1);}
 return sdk_adv_result;}
static void ble_advertising_conn_cfg_tag_set(void *a,unsigned tag){(void)a;assert(tag==1);}
static unsigned last_addr;static uint8_t last_full_addr[6];static const char *last_name;static uint32_t last_service;
static int m_gatt;
static bool m_mode_pending,m_mode_adv_requested,m_mode_handlers_ready,m_mode_stop_requested,m_mode_wait_reply;
static uint32_t m_mode_wait_tick;
static ble_device_mode_t m_pending_mode;
static nus_rx_data_handler_t m_pending_rx,installed_rx;
static nus_tx_ready_handler_t m_pending_tx;
static bool ble_is_connected(void){return m_conn_handle!=65535;}
static bool ble_remote_dispatching(void){return mock_dispatch;}
static bool ble_remote_response_pending(void){return mock_reply;}
static uint32_t app_timer_cnt_get(void){return clock_tick;}
static uint32_t app_timer_cnt_diff_compute(uint32_t a,uint32_t b){return a-b;}
static void ble_work_disconnected(void){work_resets++;mock_clean=false;}
static bool ble_work_cleanup_complete(void){return mock_clean;}
static void ble_work_set_handlers(nus_rx_data_handler_t rx,nus_tx_ready_handler_t tx){(void)tx;installed_rx=rx;owner_installs++;mock_clean=false;}
static void ble_on_disconnected(void){cleanup_calls++;mock_clean=true;}
static void ble_work_process(nus_tx_ready_handler_t clean){assert(!critical_depth);clean();}
static unsigned sd_ble_gap_adv_stop(unsigned h){(void)h;stopped++;return 0;}
static unsigned sd_ble_gap_disconnect(unsigned h,unsigned reason){assert(h!=65535&&reason==0x13);disconnected++;return 0;}
static unsigned ble_advertising_start(void *a,unsigned mode){(void)a;if(mode==BLE_ADV_MODE_FAST){assert(m_sessions_enabled&&!m_mode_pending);if(!sdk_start_result){advertised++;m_advertising_active=true;}return sdk_start_result;}assert(mode==0);return 0;}
static unsigned sd_ble_gap_addr_set(ble_gap_addr_t *a){assert(critical_depth&&m_conn_handle==65535&&mock_clean&&!m_sessions_enabled);addr_calls++;last_addr=a->addr[0];memcpy(last_full_addr,a->addr,6);return sdk_addr_result;}
static unsigned sd_ble_gap_device_name_set(ble_gap_conn_sec_mode_t *a,const uint8_t*b,size_t n){(void)a;assert(n==strlen((char*)b));name_calls++;last_name=(const char*)b;return sdk_name_result;}
static unsigned nrf_ble_gatt_att_mtu_periph_set(void *g,unsigned mtu){(void)g;assert(mtu==250);return sdk_mtu_result;}

static void ble_service_id_set(unsigned suffix){assert(m_pending_mode!=BLE_DEVICE_MODE_REMOTE);last_service=suffix;}
static void ble_stop_transport(void);
static void ble_pending_mode_poll(void);
'''
names=['remote_init_step','ble_remote_init_phase','ble_remote_init_result','advertising_init','advertising_start','ble_set_device_name','ble_addr_set','ble_apply_device_mode','ble_adv_start','ble_restart_advertising','ble_stop_transport','ble_disable','ble_device_mode_prepare','ble_pending_mode_poll','ble_nus_set_handler']
code+='\n'.join(function(n) for n in names)
code+=r'''
static void rx(const uint8_t *p,size_t n){(void)p;(void)n;}
static void reset(void){
 m_conn_handle=65535;m_sessions_enabled=false;m_remote_mode=false;m_mode_pending=false;
 sdk_addr_result=sdk_name_result=sdk_adv_result=sdk_mtu_result=sdk_start_result=0;addr_calls=name_calls=adv_config_calls=advertised=disconnected=stopped=work_resets=owner_installs=cleanup_calls=clock_tick=0;
 mock_clean=true;mock_dispatch=mock_reply=false;m_advertising.p_adv_data=&m_advertising;m_advertising.adv_mode_current=0;m_session_generation=0;
}
static void start(ble_device_mode_t mode){ble_device_mode_prepare(mode);ble_adv_start();ble_nus_set_handler(rx,NULL);}
int main(void){
 reset();ble_device_mode_prepare(BLE_DEVICE_MODE_REMOTE);assert(ble_remote_init_phase()==BLE_REMOTE_INIT_WAIT&&!ble_remote_init_result());ble_adv_start();ble_pending_mode_poll();assert(!addr_calls&&m_mode_pending);mock_clean=true;ble_pending_mode_poll();assert(!addr_calls);ble_nus_set_handler(rx,NULL);ble_pending_mode_poll();assert(advertised==1&&m_remote_mode&&m_sessions_enabled&&!m_mode_pending&&installed_rx==rx);assert(!strcmp(last_name,"Pixl.Remote")&&last_addr==0xA0);assert(configured_timeout==0&&configured_flags==6);assert(ble_remote_init_phase()==BLE_REMOTE_INIT_READY&&!ble_remote_init_result());ble_pending_mode_poll();assert(addr_calls==1);
 reset();m_conn_handle=7;m_sessions_enabled=true;start(BLE_DEVICE_MODE_PIXLJS);assert(disconnected==1&&!m_sessions_enabled);mock_clean=true;ble_pending_mode_poll();assert(!addr_calls);m_conn_handle=65535;mock_clean=false;ble_pending_mode_poll();assert(!addr_calls);mock_clean=true;ble_pending_mode_poll();assert(addr_calls==1&&m_file_mode&&advertised==1);assert(configured_timeout==18000&&configured_flags==5);
 reset();m_conn_handle=7;m_remote_mode=true;m_sessions_enabled=true;mock_dispatch=mock_reply=true;start(BLE_DEVICE_MODE_AMILOOP);assert(!disconnected&&m_sessions_enabled);mock_dispatch=false;ble_pending_mode_poll();assert(!disconnected);clock_tick=1999;ble_pending_mode_poll();assert(!disconnected);mock_reply=false;ble_pending_mode_poll();assert(disconnected==1&&!m_sessions_enabled);m_conn_handle=65535;mock_clean=true;ble_pending_mode_poll();assert(last_addr==0x90&&!strcmp(last_name,"AmiLoop"));assert(configured_timeout==18000&&configured_flags==5);
 reset();m_conn_handle=7;m_remote_mode=true;m_sessions_enabled=true;mock_dispatch=mock_reply=true;start(BLE_DEVICE_MODE_PIXLJS);clock_tick=2000;ble_pending_mode_poll();assert(disconnected==1&&!m_sessions_enabled);
 for(unsigned fault=0;fault<4;fault++)for(unsigned result=8;result<=17;result+=9){
  reset();start(BLE_DEVICE_MODE_AMIIBOLINK_V2);mock_clean=true;
  unsigned *slot=fault==0?&sdk_addr_result:fault==1?&sdk_name_result:fault==2?&sdk_mtu_result:&sdk_adv_result;*slot=result;
  ble_pending_mode_poll();assert(m_mode_pending&&!m_sessions_enabled&&!advertised&&m_session_generation==1);
  *slot=0;ble_pending_mode_poll();assert(!m_mode_pending&&m_sessions_enabled&&advertised==1&&m_session_generation==2&&last_service==0x180f&&last_addr==0x80);
 }
 reset();start(BLE_DEVICE_MODE_REMOTE);ble_disable();mock_clean=true;ble_pending_mode_poll();assert(!m_mode_pending&&!addr_calls&&!advertised);
 reset();start(BLE_DEVICE_MODE_REMOTE);start(BLE_DEVICE_MODE_PIXLJS);mock_clean=true;ble_pending_mode_poll();assert(m_file_mode&&!m_remote_mode&&!strcmp(last_name,"Pixl.js")&&advertised==1);
 for(unsigned fault=0;fault<4;fault++)for(unsigned result=8;result<=17;result+=9){
  reset();start(BLE_DEVICE_MODE_REMOTE);mock_clean=true;
  unsigned *slot=fault==0?&sdk_addr_result:fault==1?&sdk_name_result:fault==2?&sdk_mtu_result:&sdk_adv_result;*slot=result;
  ble_pending_mode_poll();assert(m_mode_pending&&!m_sessions_enabled&&!advertised);
  assert(ble_remote_init_phase()==BLE_REMOTE_INIT_ADDRESS+fault&&ble_remote_init_result()==result);
  *slot=0;ble_pending_mode_poll();assert(ble_remote_init_phase()==BLE_REMOTE_INIT_READY&&!ble_remote_init_result()&&advertised==1);
  ble_disable();assert(ble_remote_init_phase()==BLE_REMOTE_INIT_IDLE&&!ble_remote_init_result());
 }
 for(unsigned low=0;low<256;low++){
  reset();m_default_gap_addr=(ble_gap_addr_t){{low,0xAB,0xCD,0xEF,0x45,0xC6}};start(BLE_DEVICE_MODE_REMOTE);mock_clean=true;ble_pending_mode_poll();
  assert(last_full_addr[0]==(uint8_t)(low+0x30));assert(last_full_addr[1]==0xAB+(low+0x30>255));
  assert(!memcmp(last_full_addr+2,m_default_gap_addr.addr+2,4));
  const unsigned offsets[]={0,1,0x10,0x20};
  for(unsigned i=0;i<4;i++){ble_gap_addr_t other=m_default_gap_addr;other.addr[0]+=offsets[i];assert(memcmp(other.addr,last_full_addr,6));}
 }
 for(unsigned carry_bytes=1;carry_bytes<=5;carry_bytes++){
  reset();m_default_gap_addr=(ble_gap_addr_t){{0xF0,0xFF,0xFF,0xFF,0xFF,0xC5}};
  if(carry_bytes<5)m_default_gap_addr.addr[carry_bytes]=0x45;
  start(BLE_DEVICE_MODE_REMOTE);mock_clean=true;ble_pending_mode_poll();assert(last_full_addr[0]==0x20);
  for(unsigned i=1;i<carry_bytes;i++)assert(last_full_addr[i]==0);
  assert(last_full_addr[carry_bytes]==(carry_bytes==5?0xC6:0x46));
  for(unsigned i=carry_bytes+1;i<6;i++)assert(last_full_addr[i]==m_default_gap_addr.addr[i]);
 }
 reset();start(BLE_DEVICE_MODE_REMOTE);mock_clean=true;ble_pending_mode_poll();
 assert(!ble_restart_advertising()&&advertised==1&&ble_remote_init_phase()==BLE_REMOTE_INIT_READY);
 m_advertising_active=false;m_conn_handle=7;assert(!ble_restart_advertising()&&advertised==1);
 m_conn_handle=65535;
 for(unsigned result=8;result<=17;result+=9){
  sdk_start_result=result;assert(!ble_restart_advertising());
  assert(ble_remote_init_phase()==BLE_REMOTE_INIT_START&&ble_remote_init_result()==result&&!m_advertising_active);
 }
 sdk_start_result=0;assert(ble_restart_advertising()&&advertised==2);
 assert(ble_remote_init_phase()==BLE_REMOTE_INIT_READY&&!ble_remote_init_result());
 reset();m_default_gap_addr=(ble_gap_addr_t){{0xCF,255,255,255,255,255}};start(BLE_DEVICE_MODE_REMOTE);mock_clean=true;ble_pending_mode_poll();assert(last_full_addr[0]==0xFD&&last_full_addr[5]==0xFF);
 reset();m_default_gap_addr=(ble_gap_addr_t){{0xD0,255,255,255,255,255}};start(BLE_DEVICE_MODE_REMOTE);mock_clean=true;ble_pending_mode_poll();assert(last_full_addr[0]==2&&last_full_addr[1]==0&&last_full_addr[5]==0xC0);
 assert(!critical_depth);puts("PASS deferred modes, GAP+cleanup/ACK gates, init and restart BUSY/INVALID_STATE retries, diagnostic phases, 256 address low bytes, multibyte carry, 46-bit endpoints and legacy identity separation");
 return 0;
}
'''
with tempfile.TemporaryDirectory(prefix='remote-modes-') as directory:
    p=Path(directory);c=p/'test.c';exe=p/'test.exe';c.write_text(code,encoding='utf-8')
    arm=os.environ.get('PIXL_ARM32')=='1';san=os.environ.get('PIXL_SANITIZE')=='1' and not arm
    cmd=['arm-linux-gnueabihf-gcc' if arm else 'gcc','-std=c11','-O1','-g','-fshort-enums','-Wall','-Wextra','-Werror',str(c),'-o',str(exe)]
    if arm:cmd+=['-static']
    if san:cmd+=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer','-fno-pie','-no-pie']
    subprocess.run(cmd,check=True,timeout=60)
    subprocess.run((['qemu-arm'] if arm else [])+[str(exe)],check=True,timeout=30)
# SDK configuration keeps automatic restart disabled throughout partial init.
assert 'init.config.ble_adv_on_disconnect_disabled = true;' in function('advertising_init')
assert 'if (!m_sessions_enabled)' in function('ble_evt_handler')
