"""Actual shutdown handler: journal save occurs awake; errors cannot trap sleep."""
import unittest
from root_host import HostTests, SRC, function


class SleepSaveTests(HostTests):
    def test_sleep_closes_app_with_and_without_hibernate(self):
        source = (SRC / 'core/mini_app_launcher.c').read_text(encoding='utf-8')
        self.compile_run(r'''
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <string.h>
#include <stdio.h>
typedef struct mini_app_inst mini_app_inst_t;
typedef struct {int id; bool hibernate_enabled; void(*kill_cb)(mini_app_inst_t*);} mini_app_t;
struct mini_app_inst {mini_app_t*p_app;uint8_t*p_retain_data;};
typedef struct {mini_app_inst_t*p_main_app_inst;} mini_app_launcher_t;
typedef struct {int id;bool enabled;uint8_t retain_data[312];} cache_data_t;
typedef struct {bool hibernate_enabled;} settings_data_t;
static cache_data_t cache;
static settings_data_t settings;
static int kills,expected_retain;
static cache_data_t* cache_get_data(void){return &cache;}
static settings_data_t* settings_get_data(void){return &settings;}
static void kill(mini_app_inst_t*app){
 kills++; assert(app->p_retain_data==(expected_retain?cache.retain_data:NULL));
 if(expected_retain) {assert(cache.enabled&&cache.id==7);cache.retain_data[0]=42;}
 else {assert(!cache.enabled);for(int i=0;i<312;i++)assert(cache.retain_data[i]==0);}
}
#define NRF_LOG_INFO(...) ((void)0)
''' + function(source, 'mini_app_launcher_sleep') + r'''
int main(void){
 mini_app_t type={.id=7,.kill_cb=kill};mini_app_inst_t app={.p_app=&type};
 mini_app_launcher_t launcher={.p_main_app_inst=&app};
 for(int supported=0;supported<2;supported++)for(int enabled=0;enabled<2;enabled++){
  memset(&cache,0xa5,sizeof(cache));app.p_retain_data=cache.retain_data;
  settings.hibernate_enabled=enabled;type.hibernate_enabled=supported;
  expected_retain=enabled&&supported;kills=0;
  mini_app_launcher_sleep(&launcher);assert(kills==1);
  if(expected_retain)assert(cache.retain_data[0]==42);
 }
 launcher.p_main_app_inst=NULL;kills=0;mini_app_launcher_sleep(&launcher);assert(kills==0);
 puts("PASS: sleep releases app resources with every hibernate flag combination");
 return 0;
}
''')

    def test_save_order_and_positive_or_negative_errors(self):
        source = (SRC / 'main.c').read_text(encoding='utf-8')
        self.compile_run(r'''
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
typedef int ret_code_t;
typedef int nrf_pwr_mgmt_evt_t;
typedef struct { unsigned char bytes[4]; } ntag_t;
typedef struct { ntag_t ntag; } cache_data_t;
#define NRF_PWR_MGMT_EVT_PREPARE_WAKEUP 1
#define NRF_SUCCESS 0
#define BTN_ID_SLEEP 2
#define BUTTON_PULL 3
static int order[12], count, warnings, save_result;
static cache_data_t cache;
static ntag_t current = {{1,2,3,4}};
#define NRF_LOG_DEBUG(...) ((void)0)
#define NRF_LOG_WARNING(...) (++warnings)
#define APP_ERROR_CHECK(value) assert((value) == 0)
static void step(int value) { assert(count < 12); order[count++] = value; }
static void nrf_pwr_mgmt_cancel_shutdown(void) {}
static bool ntag_emu_prepare_change(void) {step(-2);current.bytes[0]=42;return true;}
static void ble_disable(void) {step(-1);}
static void ble_process_pending(void) {step(0);}
static void *mini_app_launcher(void) { return 0; }
static void mini_app_launcher_sleep(void *value) {(void)value;assert(count==3&&current.bytes[0]==42);step(1);}
static cache_data_t *cache_get_data(void) { return &cache; }
static ntag_t *ntag_emu_get_current_tag(void) { return &current; }
static void cache_save(void) {step(2);}
static int32_t settings_save(void) {step(3);return save_result;}
static void *mui(void) {return 0;}
static void mui_deinit(void *value) {(void)value;step(4);}
static void hal_spi_flash_sleep(void) {step(5);}
static int bsp_board_button_idx_to_pin(int button) {assert(button==2);return 7;}
static void nrf_gpio_cfg_input(int pin, int pull) {assert(pin==7&&pull==BUTTON_PULL);step(6);}
static int bsp_wakeup_button_enable(int button) {assert(button==2);step(7);return 0;}
static int bsp_nfc_sleep_mode_prepare(void) {step(8);return 0;}
static void bsp_board_leds_off(void) {step(9);}
''' + function(source, 'shutdown_handler') + r'''
int main(void) {
  const int results[] = {0,-91,8};
  for (unsigned i=0;i<3;i++) {
    count=warnings=0;save_result=results[i];memset(&cache,0,sizeof(cache));current.bytes[0]=1;
    assert(shutdown_handler(NRF_PWR_MGMT_EVT_PREPARE_WAKEUP));
    assert(count==12 && warnings==(results[i]!=0));
    for(int j=0;j<12;j++)assert(order[j]==j-2);
    assert(cache.ntag.bytes[0]==42 && memcmp(&cache.ntag,&current,sizeof(current))==0);
  }
  count=warnings=0;assert(shutdown_handler(0));assert(count==0&&warnings==0);
  puts("PASS: NFC flush before BLE/app teardown/retention; save before flash sleep; either sign of error is reported");
  return 0;
}
''')


if __name__ == '__main__':
    unittest.main()
