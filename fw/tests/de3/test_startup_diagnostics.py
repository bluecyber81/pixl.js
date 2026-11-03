"""Startup RTC conversion, optional-build behavior, and phase placement."""
import unittest
from pathlib import Path
from test_app_startup_allocations import SRC, compile_run, function


class StartupDiagnosticsTests(unittest.TestCase):
    def test_actual_rtc_conversion_prescaler_wrap_and_saturation(self):
        text = (SRC / 'main.c').read_text(encoding='utf-8')
        body = function(text, 'startup_elapsed_ms')
        source = r'''
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
static uint32_t now,prescaler=1;
#define APP_TIMER_CONFIG_RTC_FREQUENCY prescaler
#define APP_TIMER_CLOCK_FREQ 32768u
static uint32_t app_timer_cnt_get(void) { return now; }
static uint32_t app_timer_cnt_diff_compute(uint32_t a,uint32_t b) { return (a-b)&0xffffffu; }
'''+body+r'''
int main(void) {
 now=16384; assert(startup_elapsed_ms(0)==1000);
 now=81920; assert(startup_elapsed_ms(0)==5000);
 now=0x1000; assert(startup_elapsed_ms(0xfff000)==500);
 now=0xffffff; assert(startup_elapsed_ms(0)==1023999);
 prescaler=0;now=32768;assert(startup_elapsed_ms(0)==1000);
 prescaler=4095;now=0xffffff;assert(startup_elapsed_ms(0)==2097151875u);
 prescaler=8191;assert(startup_elapsed_ms(0)==4194303750u);
 prescaler=16383;assert(startup_elapsed_ms(0)==UINT32_MAX);
 puts("PASS");return 0;
}
'''
        compile_run(source)

    def test_disabled_feature_has_no_write_or_snapshot(self):
        header = (SRC / 'mod/runtime_diag.h').as_posix()
        compile_run(r'''
#include <assert.h>
#include <stdio.h>
'''+f'#include "{header}"\n'+r'''
int main(void) {
 uint8_t data[STARTUP_DIAG_SIZE];
 for(unsigned i=0;i<sizeof(data);i++)data[i]=0xa5;
 runtime_diag_startup_mark(0,0);
 assert(!runtime_diag_startup_snapshot(data,sizeof(data)));
 for(unsigned i=0;i<sizeof(data);i++)assert(data[i]==0xa5);
 assert(!runtime_diag_startup_snapshot(NULL,0));
 puts("PASS");return 0;
}
''')

    def test_measurement_phase_order_and_existing_clock(self):
        main = (SRC / 'main.c').read_text(encoding='utf-8').split('int main(void) {', 1)[1]
        ordered = ('nrf_pwr_mgmt_init();', 'nrf_sdh_enable_request();',
                   'const uint32_t startup_started = app_timer_cnt_get();',
                   'runtime_diag_startup_mark(STARTUP_STORAGE_BEGIN', 'settings_init();',
                   'runtime_diag_startup_mark(STARTUP_STORAGE_DONE', 'check_wakeup_src();',
                   'amiibo_helper_try_load_amiibo_keys_from_vfs();',
                   'runtime_diag_startup_mark(STARTUP_DISPLAY_BEGIN', 'mui_init(p_mui);',
                   'runtime_diag_startup_mark(STARTUP_DISPLAY_DONE',
                   'mini_app_launcher_init(p_launcher, wakeup_reason);',
                   'runtime_diag_startup_mark(STARTUP_LAUNCHER_DONE', 'mui_tick(p_mui);',
                   'if (!startup_dispatched)', 'runtime_diag_startup_mark(STARTUP_DISPATCH_DONE',
                   'startup_dispatched = true;')
        indexes = [main.index(item) for item in ordered]
        self.assertEqual(indexes, sorted(indexes))
        power = (SRC / 'sdk/pwr_mgmt/nrf_pwr_mgmt.c').read_text(encoding='utf-8')
        self.assertIn('app_timer_start(m_pwr_mgmt_timer, APP_TIMER_TICKS(1000), NULL)', power)


if __name__ == '__main__':
    unittest.main()
