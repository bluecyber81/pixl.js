"""Test-build GC RAM status and RTC mount profiling, using production C.

No physical device, synthetic 2-MiB NOR. Queries must not read or write NOR,
allocate, alter the mounted store, or initiate cleanup. Timing uses a mocked
RTC; these tests establish attribution and encoding, never device speed.
"""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from test_spi_transactions import function

HERE = Path(__file__).resolve().parent
FW = HERE.parents[1]
SRC = FW / 'application/src'
CORE = SRC / 'mod/vfs'
LFS = FW / 'components/littlefs'


def compile_run(folder, source, *, files=(), includes=(), defines=()):
    (folder / 'contract.c').write_text(source)
    output = folder / 'contract'
    command = ['gcc', '-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
               '-Wno-unused-function', '-Wno-unused-variable',
               '-Wno-misleading-indentation', '-Wno-sign-compare',
               '-DPIXL_TEST_DIAGNOSTICS=1', '-DBOARD_LCD=1']
    command += ['-D' + value for value in defines]
    for path in (folder, *includes):
        command += ['-I', str(path)]
    command += [str(folder / 'contract.c'), *map(str, files), '-o', str(output)]
    if os.environ.get('PIXL_SANITIZE') == '1':
        command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all',
                    '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
    result = subprocess.run(command, capture_output=True, text=True, timeout=90)
    if result.returncode:
        raise AssertionError(result.stdout + result.stderr)
    result = subprocess.run([str(output)], capture_output=True, text=True, timeout=90)
    if result.returncode:
        raise AssertionError(result.stdout + result.stderr)
    return result.stdout


class StorageMeasurementTests(unittest.TestCase):
    def test_gc_actual_store_lifecycle_errors_and_no_io(self):
        with tempfile.TemporaryDirectory(prefix='gc-diagnostic-de396-') as temp:
            folder = Path(temp)
            (folder / 'boards.h').write_text('#pragma once\n#define VFS_PACKED_LFS_ENABLE 1\n')
            (folder / 'nrf_log.h').write_text('#define NRF_LOG_INFO(...) ((void)0)\n')
            (folder / 'ble_main.h').write_text('void ble_disable(void);\n')
            (folder / 'utils2.h').write_text('#include <stdbool.h>\nbool system_prepare_reset(void);\nbool system_reset_prepared(void);\nvoid system_cancel_reset(void);\nbool system_reboot(void);\n')
            (folder / 'mui_mem.h').write_bytes((HERE / 'packed_test_mui_mem.h').read_bytes())
            spi_header = (HERE / 'test_packed_vfs_persistence_de344.py').read_text().split(
                "(folder/'hal_spi_flash.h').write_text('''")[1].split("'''")[0]
            (folder / 'hal_spi_flash.h').write_text(spi_header)
            fixture = (HERE / 'packed_vfs_persistence_de344.c').read_text()
            fixture = fixture[:fixture.index('static void boundary_api(')]
            source = r'''
#include "lfs.h"
static int observed_dir_open(lfs_t *, lfs_dir_t *, const char *);
#define lfs_dir_open observed_dir_open
''' + fixture + r'''
#undef lfs_dir_open
#include PROTOCOL
static df_frame_t response;
static unsigned sends;
void df_core_send_frame(df_frame_t *frame){response=*frame;sends++;}
size_t df_core_max_payload(void){return DF_PAYLOAD_LEN;}
bool vfs_drive_enabled(vfs_drive_t drive){return drive==VFS_DRIVE_EXT;}
vfs_driver_t *vfs_get_driver(vfs_drive_t drive){REQUIRE(drive==VFS_DRIVE_EXT);return driver();}
void ble_disable(void){REQUIRE(0);}
bool system_prepare_reset(void){REQUIRE(0);return false;}
bool system_reset_prepared(void){REQUIRE(0);return false;}
void system_cancel_reset(void){REQUIRE(0);}
bool system_reboot(void){REQUIRE(0);return false;}
int32_t vfs_packed_layout(uint8_t drive,uint8_t out[72]){(void)drive;(void)out;REQUIRE(0);return -1;}
void vfs_packed_import_status(uint8_t drive,uint8_t out[40]){(void)drive;(void)out;REQUIRE(0);}
static int root_open_error;
static int observed_dir_open(lfs_t *fs, lfs_dir_t *dir, const char *path) {
    if (root_open_error && !strcmp(path,"/")) {
        int result=root_open_error; root_open_error=0; return result;
    }
    return lfs_dir_open(fs,dir,path);
}
static uint32_t word(const uint8_t*p) {
    return (uint32_t)p[0] | (uint32_t)p[1]<<8 | (uint32_t)p[2]<<16 | (uint32_t)p[3]<<24;
}
static void report(uint8_t out[24]) {
    unsigned reads=read_calls, allocations=alloc_calls;
    size_t bytes=live;
    unsigned programs=media.stats.programs, erases=media.stats.erases;
    uint8_t before[sizeof(*store)];
    if(store)memcpy(before,store,sizeof(before));
    REQUIRE(vfs_packed_gc_diagnostic(out,24));
    REQUIRE(!memcmp(out,"PXGC",4) && out[4]==1 && out[5]==24 && out[6]=='E');
    REQUIRE(!word(out+20));
    REQUIRE(read_calls==reads && alloc_calls==allocations && live==bytes);
    REQUIRE(media.stats.programs==programs && media.stats.erases==erases);
    if(store)REQUIRE(!memcmp(before,store,sizeof(before)));
}
static void emit_fixture(const char *name,const uint8_t p[24]) {
    printf("FIXTURE %s ",name);
    for(unsigned i=0;i<24;i++)printf("%02x",p[i]);
    puts("");
}
static void storage_request(df_frame_t request,bool valid,unsigned length) {
    unsigned reads=read_calls,allocations=alloc_calls;
    unsigned programs=media.stats.programs,erases=media.stats.erases,old_sends=sends;
    size_t bytes=live;
    uint8_t before[sizeof(*store)];if(store)memcpy(before,store,sizeof(before));
    file_chunk_state_t file_before=file_chunk_state;
    dir_chunk_state_t dir_before=dir_chunk_state;
    df_event_t event={.type=DF_EVENT_DATA_RECEVIED,.df=&request};
    df_proto_handler_vfs_storage_info(&event);
    REQUIRE(sends==old_sends+1 && response.cmd==request.cmd && !response.chunk);
    REQUIRE(response.status==(valid?DF_STATUS_OK:DF_STATUS_ERR) && response.length==length);
    REQUIRE(reads==read_calls && allocations==alloc_calls && bytes==live);
    REQUIRE(programs==media.stats.programs && erases==media.stats.erases);
    if(store)REQUIRE(!memcmp(before,store,sizeof(before)));
    REQUIRE(!memcmp(&file_before,&file_chunk_state,sizeof(file_before)));
    REQUIRE(!memcmp(&dir_before,&dir_chunk_state,sizeof(dir_before)));
}
static void protocol_contract(void) {
    const uint8_t legacy[8]={1,'E',3,1,7,128,64,48};
    df_frame_t request={.cmd=DF_PROTO_CMD_VFS_STORAGE_INFO,.data={'E'},.length=1};
    storage_request(request,true,8);REQUIRE(!memcmp(response.data,legacy,8));
    request.length=2;request.data[1]=1;storage_request(request,true,8);
    uint8_t extended[8];memcpy(extended,legacy,8);extended[4]=15;
    REQUIRE(!memcmp(response.data,extended,8));
    request.data[1]=2;storage_request(request,true,24);
    uint8_t expected[24];report(expected);REQUIRE(!memcmp(response.data,expected,24));
    df_frame_t bad=request;bad.status=1;storage_request(bad,false,0);
    bad=request;bad.chunk=1;storage_request(bad,false,0);
    bad=request;bad.length=0;storage_request(bad,false,0);
    bad=request;bad.length=3;storage_request(bad,false,0);
    bad=request;bad.data[0]='I';storage_request(bad,false,0);
    bad=request;bad.data[0]='X';storage_request(bad,false,0);
    bad=request;bad.data[1]=3;storage_request(bad,false,0);
    unsigned before=sends;df_event_t event={.type=DF_EVENT_DATA_TRANSMIT_READY,.df=&request};
    df_proto_handler_vfs_storage_info(&event);REQUIRE(sends==before);
    /* A genuine owned file transfer must survive every status query. */
    df_frame_t open={.cmd=DF_PROTO_CMD_VFS_FILE_OPEN,.length=11};
    open.data[0]=8;memcpy(open.data+2,"E:/saved",8);open.data[10]=VFS_MODE_READONLY;
    event=(df_event_t){.type=DF_EVENT_DATA_RECEVIED,.df=&open};
    df_proto_handler_vfs_file_open(&event);REQUIRE(response.status==0 && file_chunk_state.opened);
    storage_request(request,true,24);REQUIRE(response.data[9]==1);
    bad=request;bad.length=3;storage_request(bad,false,0);
    REQUIRE(driver()->close_file(&file_chunk_state.vfs_fd)==0);file_chunk_state.opened=false;
    REQUIRE(driver()->umount()==0);storage_request(request,true,24);REQUIRE(!response.data[7]);
    REQUIRE(driver()->mount()==0);
    puts("PASS protocol: complete DF C, exact E/2 selector, legacy E and E/1 bytes, malformed requests, active transfer, unmounted and no I/O/allocation/mutation");
}
int main(void) {
    uint8_t p[24],unchanged[24]; memset(unchanged,0xa5,24);
    memcpy(p,unchanged,24);
    REQUIRE(!vfs_packed_gc_diagnostic(NULL,24));
    REQUIRE(!vfs_packed_gc_diagnostic(p,23) && !memcmp(p,unchanged,24));
    REQUIRE(!pfs_gc_diagnostic(NULL,NULL));
    report(p); REQUIRE(!p[7] && !p[8] && !word(p+12) && !word(p+16));
    emit_fixture("unmounted",p);
    for(unsigned i=0;i<2048;i++){old_data[i]=(uint8_t)(i*7+3);new_data[i]=(uint8_t)(i*13+5);}
    for(unsigned i=0;i<128;i++)meta[i]=(uint8_t)(i*9+17);
    baseline();reset_baseline();
    report(p); REQUIRE(p[7]==1 && p[8]==0 && !p[9] && !p[10] && !p[11]);
    REQUIRE(word(p+12)>0 && !word(p+16));emit_fixture("mountedUnknown",p);
    REQUIRE(pfs_gc(store)==0); report(p);
    REQUIRE(p[7]==17 && p[8]==2 && !word(p+16)); emit_fixture("clean",p);
    uint32_t generation=word(p+12);
    vfs_file_t old_reader={0},current_reader={0},writer={0};vfs_dir_t old_dir={0};
    REQUIRE(driver()->open_file("/saved",&old_reader,VFS_MODE_READONLY)==0);
    REQUIRE(driver()->open_dir("/",&old_dir)==0);
    report(p);REQUIRE(p[9]==1 && p[10]==1 && !p[11]);
    uint8_t changed_meta[128];memcpy(changed_meta,meta,128);changed_meta[0]^=1;
    REQUIRE(driver()->update_file_meta("/saved",changed_meta,128)==0);
    report(p);REQUIRE(p[7]==17 && p[8]==1 && p[9]==1 && p[10]==1 && p[11]==2);
    REQUIRE(word(p+12)==generation+1 && !word(p+16));emit_fixture("pinned",p);
    REQUIRE(driver()->open_file("/saved",&current_reader,VFS_MODE_READONLY)==0);
    report(p);REQUIRE(p[9]==2 && p[10]==1 && p[11]==2);
    REQUIRE(driver()->close_file(&old_reader)==0); report(p);
    REQUIRE(p[8]==1 && p[9]==1 && p[10]==1 && p[11]==1);
    REQUIRE(driver()->close_dir(&old_dir)==0); report(p);
    REQUIRE(p[8]==2 && p[9]==1 && !p[10] && !p[11] && !word(p+16));
    REQUIRE(driver()->close_file(&current_reader)==0);
    REQUIRE(driver()->open_file("/scratch",&writer,VFS_MODE_WRITEONLY|VFS_MODE_CREATE)==0);
    report(p);REQUIRE((p[7]&8) && !p[9] && !p[10] && !p[11]);emit_fixture("writer",p);
    REQUIRE(driver()->abort_file(&writer)==0); report(p);REQUIRE(!(p[7]&8));
    vfs_file_t many[8]={0};
    for(unsigned i=0;i<8;i++)REQUIRE(driver()->open_file("/saved",&many[i],VFS_MODE_READONLY)==0);
    report(p);REQUIRE(p[9]==8 && !p[10] && !p[11]);
    for(unsigned i=0;i<8;i++)REQUIRE(driver()->close_file(&many[i])==0);
    root_open_error=LFS_ERR_NOSPC;REQUIRE(pfs_gc(store)==LFS_ERR_NOSPC);
    report(p);REQUIRE(p[7]==17 && p[8]==1 && (int32_t)word(p+16)==LFS_ERR_NOSPC);
    emit_fixture("cleanupNoSpace",p);
    REQUIRE(pfs_gc(store)==0);report(p);REQUIRE(p[8]==2 && !word(p+16));
    root_open_error=LFS_ERR_IO;REQUIRE(pfs_gc(store)==LFS_ERR_IO);
    report(p);REQUIRE(p[7]==19 && p[8]==1 && (int32_t)word(p+16)==LFS_ERR_IO);
    emit_fixture("cleanupIoError",p);
    REQUIRE(pfs_gc(store)<0);report(p);REQUIRE((int32_t)word(p+16)==LFS_ERR_IO);
    REQUIRE(driver()->umount()==0);report(p);REQUIRE(!p[7] && !p[8] && !word(p+16));
    REQUIRE(driver()->mount()==0);report(p);REQUIRE(p[7]==1 && !p[8] && !word(p+16));
    protocol_contract();
    drop(); REQUIRE(!live);
    puts("PASS GC: no I/O/allocation/mutation, unknown/clean/pending, reader+directory pins, writer, eight handles, errors, retry and remount");
    return 0;
}
'''
            output = compile_run(folder, source,
                files=(HERE/'packed_vfs_nor_de344.c', CORE/'vfs_persist.c', LFS/'lfs.c', LFS/'lfs_util.c'),
                includes=(CORE,LFS,HERE,SRC/'mod/df'), defines=('LFS_NO_MALLOC','LFS_NO_DEBUG','LFS_NO_WARN','LFS_NO_ERROR',
                    'VFS_PACKED_LFS_ENABLE','STORE_CORE="'+str(CORE/'packed_fs.c')+'"',
                    'PROTOCOL="'+str(SRC/'mod/df/df_proto_vfs.c')+'"',
                    'STORE_ADAPTER="'+str(CORE/'vfs_driver_packed.c')+'"'))
            self.assertIn('PASS GC:',output)
            self.assertEqual(len([s for s in output.splitlines() if s.startswith('FIXTURE ')]),7)
            print(output.strip())
            destination=os.environ.get('PIXL_GC_FIXTURE')
            if destination:
                cases=[]
                for line in output.splitlines():
                    if line.startswith('FIXTURE '):
                        _,name,wire=line.split()
                        cases.append({'name':name,'hex':wire})
                Path(destination).write_text(json.dumps({'schema':1,'source':'Production pfs_gc_diagnostic and vfs_packed_gc_diagnostic on synthetic NOR; no hardware.', 'cases':cases},indent=2)+'\n')

    def test_actual_rtc_attribution_wrap_saturation_and_cached_serialization(self):
        with tempfile.TemporaryDirectory(prefix='mount-timing-de396-') as temp:
            folder=Path(temp)
            (folder/'app_util_platform.h').write_text('#define CRITICAL_REGION_ENTER() do {\n#define CRITICAL_REGION_EXIT() } while(0)\n')
            (folder/'mui_mem.h').write_bytes((HERE/'packed_test_mui_mem.h').read_bytes())
            (folder/'nrf.h').write_text('''#pragma once
#include <stdint.h>
uint32_t __get_IPSR(void);
static inline uint32_t __get_CONTROL(void){return 0;}
static inline uintptr_t __get_MSP(void){return 0;}
''')
            (folder/'app_timer.h').write_text('''#pragma once
#include <stdint.h>
#define APP_TIMER_CONFIG_RTC_FREQUENCY 1u
#define APP_TIMER_CLOCK_FREQ 32768u
uint32_t app_timer_cnt_get(void);
static inline uint32_t app_timer_cnt_diff_compute(uint32_t a,uint32_t b){return (a-b)&0xffffffu;}
''')
            source=r'''
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "mui_mem.h"
#include "runtime_diag.h"
static uint32_t clock_ticks,clock_reads;
uint32_t __StackLimit,__StackTop;
static uint32_t irq;
uint32_t __get_IPSR(void){return irq;}
uint32_t app_timer_cnt_get(void){clock_reads++;return clock_ticks&0xffffffu;}
void mui_mem_monitor(mui_mem_monitor_t *m){memset(m,0,sizeof(*m));}
static uint32_t word(const uint8_t*p){return (uint32_t)p[0]|(uint32_t)p[1]<<8|(uint32_t)p[2]<<16|(uint32_t)p[3]<<24;}
static void snapshot(uint8_t p[112]){
 uint32_t reads=clock_reads;
 assert(runtime_diag_startup_profile_snapshot(p,112));
 assert(clock_reads==reads && p[4]==5 && p[5]==112 && !memcmp(p,"PXST",4));
 assert(word(p+88)==16384);
}
int main(void){
 uint8_t p[112],old[84],copy[112];memset(p,0xa5,sizeof(p));memcpy(copy,p,sizeof(p));
 assert(!runtime_diag_startup_profile_snapshot(NULL,112));
 assert(!runtime_diag_startup_profile_snapshot(p,111) && !memcmp(p,copy,112));
 snapshot(p); assert(word(p+84)==4); for(unsigned i=92;i<112;i++)assert(!p[i]);
 assert(runtime_diag_profile_begin()==UINT32_MAX);
 runtime_diag_mount_begin(); runtime_diag_mount_configured(3);
 assert(runtime_diag_profile_begin()==UINT32_MAX);
 runtime_diag_mount_scan_begin();
 irq=1;uint32_t before_irq=clock_reads;
 assert(runtime_diag_profile_begin()==UINT32_MAX && clock_reads==before_irq);irq=0;
 clock_ticks=0xfffff0;uint32_t start=runtime_diag_profile_begin();clock_ticks=0x1000010;
 runtime_diag_profile_end(MOUNT_PROFILE_FLASH_WAIT,start);
 clock_ticks=100;uint32_t index=runtime_diag_profile_begin();
 clock_ticks=110;start=runtime_diag_profile_begin();clock_ticks=122;runtime_diag_profile_end(MOUNT_PROFILE_CRC,start);
 clock_ticks=130;start=runtime_diag_profile_begin();clock_ticks=138;runtime_diag_profile_end(MOUNT_PROFILE_FLASH_READ,start);
 clock_ticks=150;runtime_diag_profile_end(MOUNT_PROFILE_INDEX,index);
 runtime_diag_profile_end(MOUNT_PROFILE_COUNT,0);runtime_diag_profile_end(MOUNT_PROFILE_CRC,UINT32_MAX);
 snapshot(p);assert(word(p+84)==4);for(unsigned i=92;i<112;i++)assert(!p[i]);
 runtime_diag_mount_complete(0,12,26,26,256);snapshot(p);
 assert(word(p+84)==5 && word(p+92)==32 && word(p+96)==8 && word(p+100)==12 && word(p+104)==50 && word(p+108)==1);
 assert(runtime_diag_startup_cache_snapshot(old,sizeof(old)) && !memcmp(old,p,4) && !memcmp(old+6,p+6,78));
 memcpy(copy,p,112);runtime_diag_mount_scan_begin();clock_ticks+=500;
 assert(runtime_diag_profile_begin()==UINT32_MAX);runtime_diag_profile_end(MOUNT_PROFILE_CRC,0);snapshot(p);assert(!memcmp(p,copy,112));
 printf("FIXTURE startupProfile ");for(unsigned i=0;i<112;i++)printf("%02x",p[i]);puts("");
 runtime_diag_mount_begin();runtime_diag_mount_configured(1);runtime_diag_mount_complete(-5,0,0,0,0);
 snapshot(p);assert(word(p+84)==4);for(unsigned i=92;i<112;i++)assert(!p[i]);
 runtime_diag_mount_begin();runtime_diag_mount_scan_begin();clock_ticks=10;start=runtime_diag_profile_begin();
 clock_ticks=20;runtime_diag_profile_end(MOUNT_PROFILE_FLASH_READ,start);
 runtime_diag_mount_complete(-5,2,26,0,256);snapshot(p);
 assert(word(p+84)==5 && (int32_t)word(p+44)==-5 && word(p+96)==10 && word(p+108)==1);
 runtime_diag_mount_begin();runtime_diag_mount_scan_begin();
 for(unsigned i=0;i<257;i++){clock_ticks=0;start=runtime_diag_profile_begin();clock_ticks=0xffffff;runtime_diag_profile_end(MOUNT_PROFILE_CRC,start);}
 snapshot(p);assert(word(p+84)==4);for(unsigned i=92;i<112;i++)assert(!p[i]);
 runtime_diag_mount_complete(-5,10,0,0,0);snapshot(p);
 assert(word(p+84)==7 && word(p+100)==UINT32_MAX && !word(p+108));
 puts("PASS profile: RTC units/wrap, IRQ exclusion, nested attribution, no clock reads on query, frozen postmount, configure/scan failure, saturation, v4 prefix and bounds");
 return 0;
}
'''
            output=compile_run(folder,source,files=(SRC/'mod/runtime_diag.c',),includes=(SRC/'mod',),defines=('PIXL_RUNTIME_DIAGNOSTICS=1','__arm__=1','NRF52832=1'))
            self.assertIn('PASS profile:',output)
            print(output.strip())
            destination=os.environ.get('PIXL_STARTUP_PROFILE_FIXTURE')
            if destination:
                line=next(s for s in output.splitlines() if s.startswith('FIXTURE startupProfile '))
                Path(destination).write_text(json.dumps({'schema':1,'source':'Production runtime_diag_startup_profile_snapshot with deterministic RTC; no device timing.', 'hex':line.split()[2]},indent=2)+'\n')

    def test_actual_flash_read_attribution_and_unchanged_errors(self):
        with tempfile.TemporaryDirectory(prefix='flash-timing-de396-') as temp:
            folder=Path(temp)
            (folder/'app_util_platform.h').write_text('#define CRITICAL_REGION_ENTER() do {\n#define CRITICAL_REGION_EXIT() } while(0)\n')
            (folder/'mui_mem.h').write_bytes((HERE/'packed_test_mui_mem.h').read_bytes())
            (folder/'app_timer.h').write_text('''#pragma once
#include <stdint.h>
#define APP_TIMER_CONFIG_RTC_FREQUENCY 1u
#define APP_TIMER_CLOCK_FREQ 32768u
uint32_t app_timer_cnt_get(void);
static inline uint32_t app_timer_cnt_diff_compute(uint32_t a,uint32_t b){return(a-b)&0xffffffu;}
''')
            source=r'''
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "mui_mem.h"
#include "runtime_diag.h"
typedef uint32_t ret_code_t;
#define NRF_SUCCESS 0
#define NRF_ERROR_INVALID_PARAM 7
#define FLASH_ADDRESS_LIMIT 0x1000000u
#define FLASH_READY_TIMEOUT_MS 100u
#define APP_TIMER_TICKS(ms) (ms)
#define CMD_READ 3
static bool m_read_ready;
static uint32_t ticks,clock_reads,wait_calls,read_calls,wait_result,read_result;
uint32_t app_timer_cnt_get(void){clock_reads++;return ticks;}
void mui_mem_monitor(mui_mem_monitor_t *m){memset(m,0,sizeof(*m));}
static ret_code_t hal_spi_flash_wait_busy(uint32_t timeout){
 assert(timeout==FLASH_READY_TIMEOUT_MS);wait_calls++;ticks+=7;
 if(!wait_result)m_read_ready=true;return wait_result;
}
static ret_code_t hal_spi_flash_write_read(const uint8_t *tx,size_t length,void *rx,size_t size){
 const uint8_t expected[]={3,0x12,0x34,0x56};
 assert(length==4 && !memcmp(tx,expected,4) && size==16 && rx);
 read_calls++;ticks+=11;if(!read_result)memset(rx,0xa5,size);return read_result;
}
''' + function((SRC/'hal/hal_spi_flash.c').read_text(),'hal_spi_flash_read') + r'''
static uint32_t word(const uint8_t*p){return (uint32_t)p[0]|(uint32_t)p[1]<<8|(uint32_t)p[2]<<16|(uint32_t)p[3]<<24;}
int main(void){
 uint8_t data[16],p[112],copy[112];
 runtime_diag_mount_begin();runtime_diag_mount_configured(3);
 assert(hal_spi_flash_read(0x123456,data,16)==0 && !clock_reads);
 assert(wait_calls==1 && read_calls==1);
 wait_calls=read_calls=0;m_read_ready=false;runtime_diag_mount_scan_begin();
 assert(hal_spi_flash_read(FLASH_ADDRESS_LIMIT,NULL,0)==0);
 assert(hal_spi_flash_read(0,NULL,1)==NRF_ERROR_INVALID_PARAM);
 assert(hal_spi_flash_read(FLASH_ADDRESS_LIMIT,data,1)==NRF_ERROR_INVALID_PARAM);
 assert(hal_spi_flash_read(FLASH_ADDRESS_LIMIT-1,data,2)==NRF_ERROR_INVALID_PARAM);
 assert(!wait_calls && !read_calls && !clock_reads);
 assert(hal_spi_flash_read(0x123456,data,16)==0 && data[15]==0xa5);
 assert(hal_spi_flash_read(0x123456,data,16)==0);
 assert(wait_calls==1 && read_calls==2);
 m_read_ready=false;wait_result=77;
 assert(hal_spi_flash_read(0x123456,data,16)==77 && wait_calls==2 && read_calls==2);
 m_read_ready=true;read_result=88;
 assert(hal_spi_flash_read(0x123456,data,16)==88 && wait_calls==2 && read_calls==3);
 runtime_diag_mount_complete(-5,9,0,0,0);
 assert(runtime_diag_startup_profile_snapshot(p,112));
 assert(word(p+84)==5 && word(p+92)==14 && word(p+96)==33 && word(p+108)==3);
 assert(!word(p+100) && !word(p+104));
 memcpy(copy,p,112);uint32_t before=clock_reads;
 assert(hal_spi_flash_read(0x123456,data,16)==88 && clock_reads==before);
 assert(runtime_diag_startup_profile_snapshot(p,112) && !memcmp(p,copy,112));
 puts("PASS HAL: actual read function, separate busy/read attribution, cached readiness, zero/invalid requests, unchanged wait/read errors, frozen postmount");
 return 0;
}
'''
            output=compile_run(folder,source,files=(SRC/'mod/runtime_diag.c',),includes=(SRC/'mod',),defines=('PIXL_RUNTIME_DIAGNOSTICS=1',))
            self.assertIn('PASS HAL:',output)
            print(output.strip())


if __name__=='__main__':
    unittest.main()
