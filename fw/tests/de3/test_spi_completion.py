"""Actual HAL + pinned nRF5 SDK C completion paths; no device or timing claim.

Mocks supply peripheral events/AMOUNT, GPIO/RTC and RAM classification only.
The SDK transfer functions are unmodified excerpts from the pinned build image.
PIXL_SANITIZE=1 runs the same cases with ASan/UBSan on the existing Linux runtime.
"""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import tempfile

from test_spi_transactions import STUB

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SDK = HERE / 'spi_fixture' / 'sdk_17_1_0'

MODEL = r'''
typedef uint32_t nrfx_err_t;
typedef struct {
    bool transfer_in_progress;
    nrfx_spim_evt_handler_t handler;
    unsigned state,ss_pin;
    bool ss_active_high;
    struct {nrfx_spim_xfer_desc_t xfer_desc;} evt;
} spim_control_block_t;
static spim_control_block_t m_cb[1];
#define drv_inst_idx id
#define NRFX_DRV_STATE_UNINITIALIZED 0
#define NRFX_CHECK(x) 0
#define NRFX_ASSERT(x) assert(x)
#define SPIM_LENGTH_VALIDATE(i,r,t) ((r)<=255 && (t)<=255)
#define NRFX_SUCCESS NRF_SUCCESS
#define NRFX_ERROR_INVALID_ADDR 16
#define NRFX_ERROR_BUSY 17
#define NRFX_SPIM_PIN_NOT_USED 255
#define NRFX_SPIM_FLAG_HOLD_XFER (1u<<3)
#define NRFX_SPIM_FLAG_REPEATED_XFER (1u<<4)
#define NRF_SPIM_TASK_START 1
#define NRFX_LOG_WARNING(...) ((void)0)
#define NRFX_LOG_INFO(...) ((void)0)
enum {NORMAL,RX_SHORT,TX_SHORT,NO_END,END_WITHOUT_STOP,FATAL_DMA,START_ERROR};
static unsigned mode,starts,stops,end_checks,stop_checks,clears,callbacks;
static unsigned enters,exits,selected,fatals,case_id;
static uint32_t ticks,tick_step=1;
static bool masked,dma_active,stop_requested,irq_enabled;
static bool fatal_expected;
static jmp_buf fatal_jump;
static nrfx_spim_xfer_desc_t dma;
static spi_device_t device={.cs_pin=FLASH_CS_PIN};
static bool nrfx_is_in_ram(const void*p) {(void)p;return mode!=START_ERROR;}
static void nrf_spim_tx_buffer_set(NRF_SPIM_Type*r,const uint8_t*b,size_t n) {(void)r;dma.p_tx_buffer=b;dma.tx_length=n;}
static void nrf_spim_rx_buffer_set(NRF_SPIM_Type*r,uint8_t*b,size_t n) {(void)r;dma.p_rx_buffer=b;dma.rx_length=n;}
static void spim_list_enable_handle(NRF_SPIM_Type*r,uint32_t f) {
    (void)r;assert(f==NRFX_SPIM_FLAG_NO_XFER_EVT_HANDLER);
}
static void spim_int_enable(NRF_SPIM_Type*r,bool enabled) {(void)r;irq_enabled=enabled;assert(!enabled);}
static void complete(void) {
    assert(dma_active);
    mock_spim.RXD.AMOUNT=dma.rx_length-(mode==RX_SHORT && dma.rx_length?1:0);
    mock_spim.TXD.AMOUNT=dma.tx_length-(mode==TX_SHORT && dma.tx_length?1:0);
    if(mock_spim.RXD.AMOUNT)memset(dma.p_rx_buffer,0x33,mock_spim.RXD.AMOUNT);
    mock_spim.events[NRF_SPIM_EVENT_END]=true;dma_active=false;
}
bool nrf_spim_event_check(NRF_SPIM_Type*r,nrf_spim_event_t event) {
    assert(masked && selected==FLASH_CS_PIN);
    if(event==NRF_SPIM_EVENT_END){
        end_checks++;
        if(dma_active && mode<=TX_SHORT && end_checks%3==0)complete();
    } else {
        stop_checks++;
        if(stop_requested && mode==NO_END && stop_checks==4){
            assert(dma_active);dma_active=false;r->events[NRF_SPIM_EVENT_STOPPED]=true;
            r->events[NRF_SPIM_EVENT_END]=true;
        }
    }
    return r->events[event];
}
void nrf_spim_event_clear(NRF_SPIM_Type*r,nrf_spim_event_t e) {r->events[e]=false;if(e==NRF_SPIM_EVENT_STOPPED)clears++;}
void nrf_spim_task_trigger(NRF_SPIM_Type*r,unsigned t) {
    assert(masked && selected==FLASH_CS_PIN);
    if(t==NRF_SPIM_TASK_START){
        assert(!dma_active);assert(!r->events[NRF_SPIM_EVENT_STOPPED]);
        dma_active=true;stop_requested=false;starts++;
    }else{
        assert(t==NRF_SPIM_TASK_STOP);stops++;stop_requested=true;
        if(mode==END_WITHOUT_STOP)complete();
    }
}
uint32_t app_timer_cnt_get(void){uint32_t result=ticks;ticks=(ticks+tick_step)&0xffffffu;return result;}
uint32_t app_timer_cnt_diff_compute(uint32_t a,uint32_t b){return(a-b)&0xffffffu;}
void app_util_critical_region_enter(uint8_t*n){*n=masked;masked=true;enters++;}
void app_util_critical_region_exit(uint8_t n){assert(masked&&!selected&&!dma_active);masked=n;exits++;}
void nrf_gpio_cfg_output(uint32_t p){(void)p;}
void nrf_gpio_pin_clear(uint32_t p){assert(masked&&!selected);selected=p;}
void nrf_gpio_pin_set(uint32_t p){assert(p==FLASH_CS_PIN);selected=0;}
void nrf_gpio_pin_write(uint32_t p,uint32_t v){(void)p;(void)v;}
void u8x8_gpio_SetDC(u8x8_t*d,uint8_t v){(void)d;(void)v;}
uint32_t nrfx_spim_init(const nrfx_spim_t*s,const nrfx_spim_config_t*c,nrfx_spim_evt_handler_t h,void*x){
    (void)s;assert(h&&x==NULL&&c->frequency==NRF_SPIM_FREQ_8M);
    m_cb[0].handler=h;m_cb[0].state=1;m_cb[0].ss_pin=NRFX_SPIM_PIN_NOT_USED;return 0;
}
void mock_error(uint32_t e){
    assert(e==NRF_ERROR_INTERNAL&&fatal_expected&&masked&&!selected&&dma_active);
    fatals++;assert(m_bus_faulted);
    if(case_id==11)return; /* Test the non-returning SystemReset fallback. */
    longjmp(fatal_jump,1); /* Models a reset boundary, never a safe DMA return. */
}
/* ACTUAL_SDK */
static uint32_t transaction(unsigned tx,unsigned rx){
    uint8_t bytes[542],send[540];memset(bytes,0xa5,sizeof bytes);memset(send,0x55,sizeof send);
    spi_transaction_t tr={.p_tx_buffer=tx?send:NULL,.tx_length=tx,.p_rx_buffer=rx?bytes+1:NULL,.rx_length=rx};
    hal_spi_bus_aquire(&device);uint32_t result=hal_spi_bus_xfer(&tr);hal_spi_bus_release(&device);
    assert(!dma_active&&!masked&&!selected&&enters==exits&&!m_cb[0].transfer_in_progress&&!irq_enabled);
    assert(bytes[0]==0xa5&&bytes[rx+1]==0xa5);
    if(!result)for(unsigned i=1;i<=rx;i++)assert(bytes[i]==0x33);
    return result;
}
static void followup(void){
    unsigned before=starts;mode=NORMAL;assert(transaction(4,16)==NRF_SUCCESS);assert(starts==before+1);
}
int main(int argc,char**argv){
    assert(argc==2);case_id=(unsigned)atoi(argv[1]);hal_spi_bus_init();
    if(case_id==0){
        const unsigned lengths[]={0,1,2,3,4,127,128,129,205,256,540};
        for(unsigned i=0;i<sizeof lengths/sizeof *lengths;i++){
            assert(transaction(0,lengths[i])==0);assert(transaction(lengths[i],0)==0);
            assert(transaction(lengths[i],lengths[i])==0);
        }
        assert(transaction(129,4)==0&&transaction(4,129)==0&&!stops);
    }else if(case_id==1||case_id==2){
        mode=case_id==1?RX_SHORT:TX_SHORT;assert(transaction(16,16)==NRF_ERROR_DATA_SIZE);
        assert(starts==1&&!stops&&!fatals);followup();
    }else if(case_id==3||case_id==7||case_id==8||case_id==9){
        mode=NO_END;if(case_id==7)tick_step=0;if(case_id==8)ticks=0xfffff0;
        if(case_id==9)mock_spim.events[NRF_SPIM_EVENT_STOPPED]=true;
        assert(transaction(4,16)==NRF_ERROR_TIMEOUT);assert(stops==1&&stop_checks==4&&!fatals&&clears==1);
        assert(end_checks<=SPI_EVENT_POLL_LIMIT+1);followup();
    }else if(case_id==4){
        mode=END_WITHOUT_STOP;assert(transaction(4,16)==NRF_ERROR_INTERNAL);
        assert(starts==1&&stops==1&&!fatals&&m_bus_faulted);unsigned before=starts;
        mode=NORMAL;assert(transaction(4,16)==NRF_ERROR_INTERNAL&&starts==before);
    }else if(case_id==5||case_id==11){
        mode=FATAL_DMA;fatal_expected=true;
        if(setjmp(fatal_jump)==0){(void)transaction(4,16);assert(!"unsafe DMA return");}
        assert(fatals==1&&stops==1&&dma_active&&masked&&!selected&&exits==0);
        /* No caller cleanup or followup: reset, not return, is the contract. */
    }else if(case_id==6){
        mode=START_ERROR;assert(transaction(4,16)==NRFX_ERROR_INVALID_ADDR);
        assert(!starts&&!stops&&!fatals);followup();
    }else if(case_id==10){
        m_cb[0].transfer_in_progress=true;
        uint8_t a=0;spi_transaction_t tr={.p_tx_buffer=&a,.tx_length=1};
        hal_spi_bus_aquire(&device);assert(hal_spi_bus_xfer(&tr)==NRFX_ERROR_BUSY);hal_spi_bus_release(&device);
        assert(!starts&&!stops&&!fatals);m_cb[0].transfer_in_progress=false;followup();
    }else assert(!"unknown case");
    assert(!callbacks);printf("PASS case %u, starts=%u stops=%u fatal=%u\n",case_id,starts,stops,fatals);
}
'''


def main():
    cc = shutil.which('gcc')
    if not cc:
        raise RuntimeError('Existing gcc required; no skipped tests')
    pins = json.loads((SDK / 'pins.json').read_text())
    pieces = []
    for name, digest in pins['functions'].items():
        data = (SDK / (name + '.c.inc')).read_bytes()
        assert hashlib.sha256(data).hexdigest() == digest, name
        pieces.append(data.decode())
    config = (ROOT / 'fw/application/config/sdk_config.h').read_text()
    assert '#define NRFX_SPIM_NRF52_ANOMALY_109_WORKAROUND_ENABLED 0' in config
    assert '#define NRFX_SPIM3_ENABLED 1' not in config
    with tempfile.TemporaryDirectory(prefix='pixl-spi-completion-') as temp:
        directory = Path(temp)
        (directory / 'mock_sdk.h').write_text(STUB)
        for header in ['app_error.h', 'app_util_platform.h', 'app_timer.h', 'boards.h',
                       'nrfx_spim.h', 'nrf_delay.h', 'nrf_gpio.h', 'nrf_log.h']:
            (directory / header).write_text('#include "mock_sdk.h"\n')
        hal = ROOT / 'fw/application/src/hal/hal_spi_bus.c'
        source = directory / 'completion.c'
        source.write_text('#define MOCK_SPIM_CUSTOM_EVENTS 1\n#include "mock_sdk.h"\n'
                          + '#include "' + hal.as_posix() + '"\n'
                          + MODEL.replace('/* ACTUAL_SDK */', '\n'.join(pieces)))
        binary = directory / ('completion.exe' if os.name == 'nt' else 'completion')
        command = [cc, '-std=gnu11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
                   '-I', str(directory)]
        if os.environ.get('PIXL_SANITIZE') == '1':
            command += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-no-pie']
        subprocess.run(command + [str(source), '-o', str(binary)], check=True, timeout=60)
        for case in range(11):
            subprocess.run([str(binary), str(case)], check=True, timeout=15)
        # A deliberately returning fatal handler must still hit SystemReset.
        # The host-only reset stub uses _Exit(86), avoiding CRT abort dialogs.
        result = subprocess.run([str(binary), '11'], capture_output=True, timeout=15)
        assert result.returncode == 86, result.returncode
        assert b'PASS' not in result.stdout
        print('PASS returning fatal handler terminates at SystemReset stub, exit=' + str(result.returncode))
    print('PASS actual HAL + pinned SDK completion/error/RTC/CS regression suite')


if __name__ == '__main__':
    main()
