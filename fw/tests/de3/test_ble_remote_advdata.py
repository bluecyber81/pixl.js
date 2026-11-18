"""Encode production advertising with the pinned Nordic encoder, without radio.

The SDK BLE address/name/UUID getters are supplied as bounded stubs. The actual
encoder, packet-size rules and production init layout are compiled unchanged.
"""
from pathlib import Path
import hashlib
import os
import re
import shutil
import subprocess
import tempfile

FW = Path(__file__).resolve().parents[2]
SDK = Path(os.environ.get('NRF52_SDK_ROOT') or os.environ.get('NRF5_SDK_PATH') or '')
encoder = SDK / 'components/ble/common/ble_advdata.c'
assert encoder.is_file(), 'Set NRF52_SDK_ROOT or NRF5_SDK_PATH to the existing Nordic SDK'
source = (FW / 'application/src/mod/ble/ble_main.c').read_text()


def function(name):
    match = re.search(r'^(?:static\s+)?\w+\s+' + name + r'\([^;]*?\)\s*\{', source, re.M)
    assert match, name
    end = source.index('{', match.start()) + 1
    depth = 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[match.start():end]


code = r'''
#include <assert.h>
#include <stdio.h>
#include "ble_advdata.h"
#define APP_ADV_INTERVAL 64
#define APP_ADV_DURATION 18000
#define APP_BLE_CONN_CFG_TAG 1
typedef struct {
    ble_advdata_t advdata,srdata;
    struct {bool ble_adv_fast_enabled,ble_adv_on_disconnect_disabled;unsigned ble_adv_fast_interval,ble_adv_fast_timeout;}config;
    void(*evt_handler)(void);
} ble_advertising_init_t;
static struct {ble_gap_adv_data_t *p_adv_data;} m_advertising;
static uint8_t adv[31],scan[31];
static ble_gap_adv_data_t encoded;
static ble_uuid_t m_adv_uuids[]={{1,BLE_UUID_TYPE_VENDOR_BEGIN}};
static const char *device_name="Pixl.Remote";
static uint32_t name_result,uuid_result;
static uint16_t adv_limit=31,scan_limit=31;
static const uint8_t nus_uuid[16]={0x9e,0xca,0xdc,0x24,0x0e,0xe5,0xa9,0xe0,0x93,0xf3,0xa3,0xb5,1,0,0x40,0x6e};
uint32_t sd_ble_gap_addr_get(ble_gap_addr_t *addr){memset(addr,0,sizeof(*addr));return NRF_SUCCESS;}
uint32_t sd_ble_gap_appearance_get(uint16_t *appearance){*appearance=0;return NRF_SUCCESS;}
uint32_t sd_ble_gap_device_name_get(uint8_t *name,uint16_t *size){
    if(name_result)return name_result;
    unsigned length=strlen(device_name),copy=*size<length?*size:length;
    memcpy(name,device_name,copy);*size=length;return NRF_SUCCESS;
}
uint32_t sd_ble_uuid_encode(ble_uuid_t const *uuid,uint8_t *size,uint8_t *bytes){
    if(uuid_result)return uuid_result;
    assert(uuid->type==BLE_UUID_TYPE_VENDOR_BEGIN&&uuid->uuid==1);
    *size=16;if(bytes)memcpy(bytes,nus_uuid,16);return NRF_SUCCESS;
}
static uint32_t ble_advertising_init(void *object,const ble_advertising_init_t *init){
    assert(object==&m_advertising&&init->config.ble_adv_fast_enabled&&init->config.ble_adv_on_disconnect_disabled);
    memset(adv,0xA5,sizeof adv);memset(scan,0x5A,sizeof scan);
    encoded.adv_data.p_data=adv;encoded.adv_data.len=adv_limit;
    encoded.scan_rsp_data.p_data=scan;encoded.scan_rsp_data.len=scan_limit;m_advertising.p_adv_data=&encoded;
    uint32_t result=ble_advdata_encode(&init->advdata,adv,&encoded.adv_data.len);
    if(result)return result;
    return ble_advdata_encode(&init->srdata,scan,&encoded.scan_rsp_data.len);
}
static void ble_advertising_conn_cfg_tag_set(void *object,unsigned tag){assert(object==&m_advertising&&tag==1);}
static void on_adv_evt(void){}
'''
code += function('advertising_init') + '\n' + function('ble_service_id_set')
code += r'''
static bool has(const uint8_t *bytes,unsigned size,unsigned type,const void *value,unsigned length){
    for(unsigned i=0;i+1<size;i+=bytes[i]+1){assert(bytes[i]&&i+bytes[i]<size);
        if(bytes[i+1]==type)return bytes[i]==length+1&&!memcmp(bytes+i+2,value,length);
    }
    return false;
}
static void remote_ok(void){
    assert(advertising_init(true)==NRF_SUCCESS);
    assert(encoded.adv_data.len==31&&encoded.scan_rsp_data.len==13);
    const uint8_t flags=6;
    assert(has(adv,31,1,&flags,1));
    assert(has(adv,31,7,nus_uuid,16));
    assert(has(adv,31,8,"Pixl.Rem",8));
    assert(has(scan,13,9,"Pixl.Remote",11));
    assert(!ble_advdata_name_find(adv,31,"Pixl.Remote"));
    assert(ble_advdata_name_find(scan,13,"Pixl.Remote"));
    assert(ble_advdata_uuid_find(adv,31,m_adv_uuids));
}
int main(void){
    remote_ok();
    /* The old suffix patch would corrupt the new full-name scan response. */
    ble_service_id_set(0x6e400001);assert(!ble_advdata_name_find(scan,13,"Pixl.Remote"));
    remote_ok();
    device_name="Pixl.js";assert(advertising_init(false)==NRF_SUCCESS);
    assert(encoded.adv_data.len==12&&encoded.scan_rsp_data.len==18);
    assert(ble_advdata_name_find(adv,12,"Pixl.js"));assert(ble_advdata_uuid_find(scan,18,m_adv_uuids));
    device_name="Pixl.Remote";remote_ok();
    adv_limit=20;assert(advertising_init(true)==NRF_ERROR_DATA_SIZE);adv_limit=31;
    scan_limit=12;assert(advertising_init(true)==NRF_SUCCESS);
    assert(encoded.scan_rsp_data.len==12&&!has(scan,12,9,"Pixl.Remote",11));scan_limit=31;
    name_result=NRF_ERROR_BUSY;assert(advertising_init(true)==NRF_ERROR_BUSY);name_result=0;
    uuid_result=NRF_ERROR_INVALID_STATE;assert(advertising_init(true)==NRF_ERROR_INVALID_STATE);uuid_result=0;
    remote_ok();
    puts("PASS Nordic encoder: primary31 flags + NUS + Pixl.Rem, scan13 Pixl.Remote, file layout, packet limits, service patch and SDK errors");
}
'''

with tempfile.TemporaryDirectory(prefix='remote-advertising-sdk-') as temporary:
    root = Path(temporary)
    for name in ('ble_advdata.c', 'ble_advdata.h'):
        shutil.copyfile(encoder.with_name(name), root / name)
        assert (root / name).read_bytes() == encoder.with_name(name).read_bytes()
    (root / 'sdk_common.h').write_text('''#ifndef SDK_COMMON_H__
#define SDK_COMMON_H__
#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include "nrf_error.h"
typedef uint32_t ret_code_t;
typedef uint8_t uint16_le_t[2];
typedef struct {uint16_t size;uint8_t *p_data;} uint8_array_t;
#define VERIFY_SUCCESS(result) do{if((result)!=NRF_SUCCESS)return (result);}while(0)
#endif
''')
    (root / 'ble_srv_common.h').write_text('''#include <stdint.h>
static inline unsigned uint16_encode(uint16_t value,uint8_t *p){p[0]=value;p[1]=value>>8;return 2;}
static inline uint16_t uint16_decode(const uint8_t *p){return p[0]|((uint16_t)p[1]<<8);}
''')
    (root / 'nrf.h').write_text('/* No hardware registers are used by the advertisement encoder. */\n#define __STATIC_INLINE static inline\n')
    (root / 'test.c').write_text(code)
    arm = os.environ.get('PIXL_ARM32') == '1'
    cmd = ['arm-linux-gnueabihf-gcc' if arm else 'gcc', '-std=c11', '-O1', '-g', '-fshort-enums',
           '-Wall', '-Wextra', '-Werror', '-Wno-unused-parameter', '-DSVCALL_AS_NORMAL_FUNCTION', '-I', str(root),
           '-I', str(SDK / 'components/softdevice/s112/headers'), '-I', str(SDK / 'components/softdevice/s112/headers/nrf52'),
           str(root / 'test.c'), str(root / 'ble_advdata.c'), '-o', str(root / 'test')]
    if arm:
        cmd += ['-static']
    elif os.environ.get('PIXL_SANITIZE') == '1':
        cmd += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-fno-pie', '-no-pie']
    subprocess.run(cmd, check=True, timeout=60)
    subprocess.run((['qemu-arm'] if arm else []) + [str(root / 'test')], check=True, timeout=30)
    print('SDK encoder SHA256', hashlib.sha256(encoder.read_bytes()).hexdigest())
