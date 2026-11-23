"""Actual launcher + shutdown handler + new mainloop sleep wait; mocked radio."""
import re,unittest
from exit_contract_support_de358 import SRC,function,launcher_fixture,compile_cases
class MiniappSleepTests(unittest.TestCase):
    def test_asynchronous_radio_close_before_teardown(self):
        text=(SRC/'main.c').read_text()
        start=text.index('        if (m_miniapp_sleep_pending) {',text.index('while (1)'))
        end=start+len('        if (m_miniapp_sleep_pending) {');depth=1
        while depth:depth+=(text[end]=='{')-(text[end]=='}');end+=1
        block=text[start:end]
        code=launcher_fixture()+'''
#define BOARD_LCD 1
#define NRF_PWR_MGMT_SHUTDOWN_CONTINUE 99
static bool m_miniapp_sleep_pending,radio_busy;
static unsigned resumed,power_waits,ui_ticks;
static bool ble_miniapp_radio_busy(void){return radio_busy;}
'''+function(text,'shutdown_handler')+'''
static void nrf_pwr_mgmt_run(void){power_waits++;}
static void nrf_pwr_mgmt_shutdown(unsigned reason){assert(reason==99);resumed++;assert(shutdown_handler(NRF_PWR_MGMT_EVT_PREPARE_WAKEUP));}
static void mainloop_wait_step(void){do{
'''+block+'''
ui_ticks++;
}while(0);}
int main(int argc,char**argv){
 assert(argc==2);unsigned scenario=(unsigned)strtoul(argv[1],NULL,10);
 fixture_start(MINI_APP_ID_CHAMELEON);mini_app_inst_t*owner=test_launcher->p_main_app_inst;void*handle=owner->p_handle;
 if(scenario==2)allow_prepare=false;
 radio_busy=scenario!=0;
 bool accepted=shutdown_handler(NRF_PWR_MGMT_EVT_PREPARE_WAKEUP);
 if(scenario==0){assert(accepted&&!m_miniapp_sleep_pending&&ui_deinits==1&&flash_sleeps==1);}
 if(scenario==1){
  assert(!accepted&&m_miniapp_sleep_pending&&!shutdown_cancels);
  assert(owner->p_handle==handle&&!kills[MINI_APP_ID_CHAMELEON]&&!ui_deinits&&!flash_sleeps);
  assert(mini_app_launcher_exit_prepared(test_launcher,MINI_APP_EXIT_SLEEP));
  for(unsigned i=0;i<3;i++)mainloop_wait_step();
  assert(!ui_ticks&&!resumed&&power_waits==3&&!cache_saves&&!settings_saves);
  radio_busy=false;mainloop_wait_step();
  assert(resumed==1&&!m_miniapp_sleep_pending&&!ui_ticks);
  assert(prepare_calls==1&&kills[MINI_APP_ID_CHAMELEON]==1&&cache_saves==1&&settings_saves==1&&ui_deinits==1&&flash_sleeps==1);
 }
 if(scenario==2){assert(!accepted&&!m_miniapp_sleep_pending&&shutdown_cancels==1&&!ble_stops);assert(owner->p_handle==handle);mainloop_wait_step();assert(ui_ticks==1&&!resumed);}
 fixture_dispose();puts("PASS asynchronous miniapp sleep");return 0;
}
'''
        compile_cases(self,code,('already idle','hold ownership until CLOSED/restore then resume once','save refusal keeps retry UI'), 'miniapps-sleep')
if __name__=='__main__':unittest.main()
