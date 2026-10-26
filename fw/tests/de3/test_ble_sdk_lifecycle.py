"""Actual standard BLE SDK lifecycle helpers; no radio or input-protocol fuzzing."""
from pathlib import Path
import os, subprocess, tempfile

FW=Path(__file__).resolve().parents[2]
source=(FW/'application/src/mod/ble/ble_main.c').read_text(encoding='utf-8')
def function(signature):
    begin=source.index(signature); brace=source.index('{',begin); depth=1; end=brace+1
    while depth:
        depth+=(source[end]=='{')-(source[end]=='}'); end+=1
    return source[begin:end]
connected=source.split('case BLE_GAP_EVT_CONNECTED:',1)[1].split('case BLE_GAP_EVT_DISCONNECTED:',1)[0]
disconnected=source.split('case BLE_GAP_EVT_DISCONNECTED:',1)[1].split('case BLE_GAP_EVT_PHY_UPDATE_REQUEST:',1)[0]
client_timeout=source.split('case BLE_GATTC_EVT_TIMEOUT:',1)[1].split('case BLE_GATTS_EVT_TIMEOUT:',1)[0]
server_timeout=source.split('case BLE_GATTS_EVT_TIMEOUT:',1)[1].split('default:',1)[0]
code=r'''
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#define NRF_SUCCESS 0
#define NRF_LOG_INFO(...) ((void)0)
#define NRF_LOG_DEBUG(...) ((void)0)
#define APP_ERROR_CHECK(x) assert((x)==0)
#define BLE_GATT_ATT_MTU_DEFAULT 23
#define OPCODE_LENGTH 1
#define HANDLE_LENGTH 2
#define DEVICE_NAME_AMILOOP "AmiLoop"
#define BSP_INDICATE_CONNECTED 1
#define NRF_SDH_BLE_GATT_MAX_MTU_SIZE 250
#define BLE_CONNECT_SLEEP_TIMEOUT_SECONDS 180
#define BLE_CONN_HANDLE_INVALID 65535
#define NRF_BLE_GATT_EVT_ATT_MTU_UPDATED 1
static const char *sdk_name="AmiLoop";
static uint32_t sdk_error;
static uint16_t m_conn_handle=65535,m_ble_nus_max_data_len=247;
static uint16_t m_nus_session_handle=65535,m_release_handle=65535;
static uint32_t m_link_generation,m_file_join_tick,m_file_join_generation;
static bool m_file_join_pending;
static uint32_t app_timer_cnt_get(void) {return 0;}
static void nrf_pwr_mgmt_feed(void) {}
static bool m_release_attempted,m_release_requested,m_file_mode=false,m_sessions_enabled=true;
static unsigned requested_mtu,connected_count,disconnected_count,power_timeout=30;
static volatile bool m_advertising_active;
static unsigned diagnostic_disconnects;
static uint8_t diagnostic_hci;
static unsigned diagnostic_abort, timeout_disconnects;
#define RUNTIME_DIAG_GATT_CLIENT_TIMEOUT 5
#define RUNTIME_DIAG_GATT_SERVER_TIMEOUT 6
#define BLE_HCI_REMOTE_USER_TERMINATED_CONNECTION 0x13
static void runtime_diag_ble_disconnected(uint8_t reason){diagnostic_disconnects++;diagnostic_hci=reason;}
static void runtime_diag_ble_abort(uint8_t reason){diagnostic_abort=reason;}
static uint32_t sd_ble_gap_disconnect(uint16_t handle,uint8_t reason){assert(handle==7 && reason==0x13);timeout_disconnects++;return 0;}
static uint16_t m_previous_pwr_mgmt_sleep_timeout;
static int m_qwr;
static uint32_t sd_ble_gap_device_name_get(uint8_t *data,uint16_t *length) {
    assert(*length==35); memset(data,0x7f,*length);
    if(sdk_error)return sdk_error;
    size_t n=strlen(sdk_name);assert(n<=*length);memcpy(data,sdk_name,n);*length=(uint16_t)n;return 0;
}
static unsigned bsp_indication_set(int x){(void)x;return 0;}
static unsigned nrf_ble_qwr_conn_handle_assign(int*a,int b){(void)a;(void)b;return 0;}
static void ble_work_connected(void){connected_count++;}
static void ble_work_disconnected(void){disconnected_count++;}
static unsigned nrf_pwr_mgmt_get_timeout(void){return power_timeout;}
static void nrf_pwr_mgmt_set_timeout(unsigned n){power_timeout=n;}
static unsigned sd_ble_gattc_exchange_mtu_request(unsigned h,unsigned n){(void)h;requested_mtu=n;return 0;}
typedef struct {struct {struct {uint16_t conn_handle;struct {struct {uint8_t reason;} disconnected;} params;}gap_evt;struct {uint16_t conn_handle;}gattc_evt,gatts_evt;}evt;} ble_evt_t;
typedef struct {int att_mtu_desired_central,att_mtu_desired_periph;} nrf_ble_gatt_t;
typedef struct {uint16_t conn_handle,evt_id;struct {uint16_t att_mtu_effective;}params;} nrf_ble_gatt_evt_t;
typedef struct {uint8_t *p_data;uint16_t len;} bytes_t;
typedef struct {bytes_t scan_rsp_data;} adv_data_t;
static struct {adv_data_t *p_adv_data;} m_advertising;
'''
code+='\n'+function('static bool ble_device_name_is(')
code+='\n'+function('void ble_service_id_set(')
code+='\n'+function('void gatt_evt_handler(')
code+='\nstatic void connection(bool connect){ble_evt_t event={.evt.gap_evt.conn_handle=7,.evt.gap_evt.params.disconnected.reason=8};const ble_evt_t *p_ble_evt=&event;uint32_t err_code;(void)err_code;switch(connect){case 1:'+connected+'case 0:'+disconnected+'}}\n'
code+='\nstatic void timeout(bool client){ble_evt_t event={.evt.gattc_evt.conn_handle=7,.evt.gatts_evt.conn_handle=7};const ble_evt_t *p_ble_evt=&event;uint32_t err_code;switch(client){case 1:'+client_timeout+'case 0:'+server_timeout+'}}\n'
code+=r'''
int main(void){
    assert(ble_device_name_is("AmiLoop"));assert(!ble_device_name_is("Pixl.js"));
    sdk_name="Pixl.js";assert(ble_device_name_is("Pixl.js"));assert(!ble_device_name_is("AmiLoop"));
    sdk_error=8;assert(!ble_device_name_is("Pixl.js"));sdk_error=0;
    assert(!ble_device_name_is(NULL));
    sdk_name="AmiLoop";m_advertising_active=true;connection(true);
    assert(!m_advertising_active);
    assert(m_conn_handle==7 && m_ble_nus_max_data_len==20 && requested_mtu==250 && connected_count==1);
    assert(power_timeout==180);
    nrf_ble_gatt_t gatt={0};nrf_ble_gatt_evt_t evt={.conn_handle=7,.evt_id=1,.params.att_mtu_effective=250};
    gatt_evt_handler(&gatt,&evt);assert(m_ble_nus_max_data_len==247);
    m_advertising_active=true; /* SDK may restart advertising before our disconnect observer. */
    connection(false);assert(m_advertising_active);assert(m_ble_nus_max_data_len==20 && power_timeout==30 && disconnected_count==1);
    assert(diagnostic_disconnects==1 && diagnostic_hci==8);
    timeout(true);assert(diagnostic_abort==5 && timeout_disconnects==1);
    timeout(false);assert(diagnostic_abort==6 && timeout_disconnects==2);
    sdk_name="Pixl.js";requested_mtu=0;connection(true);assert(m_ble_nus_max_data_len==20 && requested_mtu==0);
    uint8_t data[13];memset(data,0x5a,sizeof(data));
    adv_data_t adv={.scan_rsp_data={.p_data=data+1,.len=8}};m_advertising.p_adv_data=&adv;
    ble_service_id_set(0x6e400001);const uint8_t expected[]={1,0,0x40,0x6e};
    assert(!memcmp(data+5,expected,4));assert(data[0]==0x5a && data[9]==0x5a);
    adv.scan_rsp_data.len=3;ble_service_id_set(0);assert(data[1]==0x5a);
    m_advertising.p_adv_data=NULL;ble_service_id_set(0);
    puts("PASS standard SDK counted names, reconnect MTU reset, GATT update, unaligned advertising suffix and lifecycle controls");
}
'''
with tempfile.TemporaryDirectory(prefix='pixl-ble-sdk-') as temp:
    path=Path(temp); c=path/'test.c';exe=path/('test.exe' if os.name=='nt' else 'test')
    c.write_text(code,encoding='utf-8')
    cmd=['gcc','-std=c11','-O1','-g','-Wall','-Wextra','-Werror','-Wno-unused-parameter']
    if os.environ.get('BLE_SDK_SANITIZE'):cmd+=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer']
    subprocess.run(cmd+[str(c),'-o',str(exe)],check=True,timeout=60)
    subprocess.run([str(exe)],check=True,timeout=20)
