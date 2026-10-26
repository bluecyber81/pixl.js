"""Recovery must not launch NFC/apps against incomplete or unmounted storage."""
import unittest
from test_bounded_ui_startup import COMMON, stripped
from test_app_startup_allocations import SRC, function, compile_run

class RecoveryLauncherTests(unittest.TestCase):
    def test_recovery_wake_does_not_start_nfc_and_uses_ram_display_defaults(self):
        text=(SRC/'main.c').read_text(encoding='utf-8')
        source=r'''
#include <stdint.h>
#include <stdbool.h>
#include <assert.h>
#include <stdio.h>
#define VFS_PACKED_LFS_ENABLE 1
#define NRF_LOG_INFO(...) ((void)0);
#define APP_ERROR_CHECK(x) assert((x)==0)
#define NRF_POWER_RESETREAS_NFC_MASK 4
#define NRF_POWER_RESETREAS_LPCOMP_MASK 8
typedef int ret_code_t;
typedef struct {int tag;} ntag_t;
typedef struct {ntag_t ntag;} cache_data_t;
typedef struct {unsigned lcd_backlight,sleep_timeout_sec;} settings_data_t;
static settings_data_t settings={7,75};
static cache_data_t cache;
static bool recovery=true;
static unsigned reason=4,cleared,tag_calls,cache_calls;
const ntag_t default_ntag215={0};
static bool vfs_packed_recovery_required(void){return recovery;}
static settings_data_t *settings_get_data(void){return &settings;}
static uint32_t nrf_power_resetreas_get(void){return reason;}
static void nrf_power_resetreas_clear(uint32_t r){cleared=r;}
static bool tag_helper_valid_default_slot(void){tag_calls++;return false;}
static bool tag_emulation_init(void){tag_calls++;return true;}
static bool tag_emulation_active_data_ready(void){tag_calls++;return true;}
static void hal_nfc_set_nrfx_irq_enable(bool x){(void)x;tag_calls++;}
static void tag_emulation_sense_run(void){tag_calls++;}
static ret_code_t ntag_emu_init(const ntag_t *p){(void)p;tag_calls++;return 0;}
static bool cache_valid(void){cache_calls++;return false;}
static cache_data_t *cache_get_data(void){cache_calls++;return &cache;}
static bool ntag_emu_set_tag(ntag_t *p) {(void)p;tag_calls++;return true;}
static void cache_clean(void){cache_calls++;}
'''
        source+=function(text,'check_wakeup_src')+'\n'+function(text,'prepare_storage_recovery_ui')
        source+=r'''
int main(void){
 assert(check_wakeup_src()==4&&cleared==4&&!tag_calls&&!cache_calls);
 prepare_storage_recovery_ui();assert(settings.lcd_backlight==30&&settings.sleep_timeout_sec==180);
 recovery=false;settings=(settings_data_t){7,75};prepare_storage_recovery_ui();
 assert(settings.lcd_backlight==7&&settings.sleep_timeout_sec==75);
 reason=0;assert(check_wakeup_src()==0&&tag_calls==2&&cache_calls==2);
 puts("PASS");return 0;
}
'''
        compile_run(source)

    def test_recovery_blocks_retained_and_explicit_apps_until_new_boot(self):
        text=(SRC/'core/mini_app_launcher.c').read_text(encoding='utf-8')
        names=('mini_app_launcher_find','mini_app_launcher_inst_kill','mini_app_launcher_inst_run',
               'mini_app_launcher_run_with_retain_data','mini_app_launcher_run','mini_app_launcher_kill',
               'mini_app_launcher_exit','mini_app_launcher_init')
        source=COMMON+'typedef int xbm_t;\n'+stripped('core/mini_app_defines.h')+stripped('core/mini_app_launcher.h')
        source+=r'''
#define VFS_PACKED_LFS_ENABLE 1
#define NRF_LOG_INFO(...) ((void)0)
#define NRF_POWER_RESETREAS_NFC_MASK 4
enum {MINI_APP_ID_DESKTOP=1,MINI_APP_ID_BLE=2,MINI_APP_ID_STATUS_BAR=3,MINI_APP_ID_CHAMELEON=4};
static bool recovery=true;
static bool vfs_packed_recovery_required(void){return recovery;}
typedef struct {bool enabled;uint32_t id;uint8_t retain_data[16];} cache_data_t;
typedef struct {bool hibernate_enabled;} settings_data_t;
static cache_data_t saved={.enabled=true,.id=4};
static settings_data_t settings={.hibernate_enabled=true};
static unsigned cache_calls,settings_calls,tag_calls,ble_runs,nfc_runs,status_runs;
static cache_data_t *cache_get_data(void){cache_calls++;return &saved;}
static settings_data_t *settings_get_data(void){settings_calls++;return &settings;}
static bool tag_helper_valid_default_slot(void){tag_calls++;return true;}
static void run(mini_app_inst_t*i){
 if(i->p_app->id==2)ble_runs++;
 if(i->p_app->id==3)status_runs++;
 if(i->p_app->id==4)nfc_runs++;
 i->p_handle=mui_mem_malloc(1);
}
static void kill(mini_app_inst_t*i){mui_mem_free(i->p_handle);i->p_handle=NULL;}
static const mini_app_t apps[]={
 {.id=1,.run_cb=run,.kill_cb=kill},{.id=2,.run_cb=run,.kill_cb=kill},
 {.id=3,.run_cb=run,.kill_cb=kill,.deamon=true},{.id=4,.run_cb=run,.kill_cb=kill}};
static const mini_app_t *mini_app_registry_find_by_id(uint32_t id){return id>=1&&id<=4?&apps[id-1]:NULL;}
'''
        source+='\n'.join(function(text,n) for n in names)
        source+=r'''
int main(void){
 mini_app_launcher_t l={0};uint8_t retained=42;
 mini_app_launcher_init(&l,NRF_POWER_RESETREAS_NFC_MASK);
 assert(!cache_calls&&!settings_calls&&!tag_calls&&!nfc_runs&&ble_runs==1&&status_runs==1);
 assert(l.p_main_app_inst->p_app->id==MINI_APP_ID_BLE);
 mini_app_launcher_run_with_retain_data(&l,MINI_APP_ID_CHAMELEON,&retained);
 assert(!nfc_runs&&l.p_main_app_inst->p_app->id==2&&!l.p_main_app_inst->p_retain_data);
 mini_app_launcher_exit(&l);assert(!nfc_runs&&l.p_main_app_inst->p_app->id==2);
 while(l.instances){mini_app_inst_t *next=l.instances->next;mini_app_launcher_inst_kill(&l,l.instances);mui_mem_free(l.instances);l.instances=next;}
 assert(!live);recovery=false;mini_app_launcher_init(&l,NRF_POWER_RESETREAS_NFC_MASK);
 assert(cache_calls==1&&settings_calls==1&&tag_calls==1&&nfc_runs==1&&l.p_main_app_inst->p_app->id==4);
 while(l.instances){mini_app_inst_t *next=l.instances->next;mini_app_launcher_inst_kill(&l,l.instances);mui_mem_free(l.instances);l.instances=next;}
 assert(!live);puts("PASS");
}
'''
        compile_run(source)

if __name__=='__main__':unittest.main()
