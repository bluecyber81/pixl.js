"""Actual-source Flash error/timeout and NFC RX-count regressions, no hardware.

Run with existing gcc. PIXL_SANITIZE=1 additionally enables ASan/UBSan.
Positive hardware/register responses are modeled; no timing or RF claim is made.
"""
from pathlib import Path
import os
import re
import shutil
import subprocess
import tempfile
from test_spi_transactions import STUB, function

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / 'fw/application/src'

FLASH_MODEL = r'''
static bool masked,selected,in_irq,inject_read,injected,wel,deny_wel,stuck,post_stuck;
static unsigned command,transfers,fail_at,commits,erases,polls,busy_left,post_busy,enters,exits,wrdi;
static uint32_t ticks,tick_step;
static uint32_t wire_address;
static bool payload;
/* The hardware RTC also advances with application IRQs masked. Bus completion
 * may inspect it inside CS; status-poll yielding is asserted separately. */
uint32_t app_timer_cnt_get(void) {return ticks;}
uint32_t app_timer_cnt_diff_compute(uint32_t a,uint32_t b) {return (a-b)&0xffffffu;}
void mock_error(uint32_t e) {(void)e;assert(!"Flash errors must return instead of aborting");}
void nrf_gpio_cfg_output(uint32_t p) {(void)p;}
void nrf_gpio_pin_clear(uint32_t p) {assert(p==FLASH_CS_PIN&&!selected&&masked);selected=true;command=0;payload=false;}
void nrf_gpio_pin_set(uint32_t p) {
    assert(p==FLASH_CS_PIN);if(!selected)return;assert(masked);
    if(command==CMD_WREN&&!deny_wel)wel=true;
    if(command==CMD_WRDI){wel=false;wrdi++;}
    if((command==CMD_PP&&payload)||command==CMD_ERASE_4K){
        if(wel){if(command==CMD_PP)commits++;else erases++;wel=false;busy_left=post_busy;stuck=post_stuck;}
    }
    selected=false;
}
void nrf_gpio_pin_write(uint32_t p,uint32_t v) {(void)p;(void)v;}
void u8x8_gpio_SetDC(u8x8_t*d,uint8_t v) {(void)d;(void)v;}
void app_util_critical_region_enter(uint8_t*n) {*n=masked;masked=true;enters++;}
void app_util_critical_region_exit(uint8_t n) {
    assert(masked&&!selected);exits++;if(!n)masked=false;
    if(inject_read&&!injected&&!in_irq&&!masked&&command==CMD_WREN){
        injected=true;in_irq=true;uint8_t scratch[4];
        assert(hal_spi_flash_read(0x2000,scratch,sizeof scratch)==NRF_SUCCESS);in_irq=false;
    }
}
uint32_t nrfx_spim_init(const nrfx_spim_t*s,const nrfx_spim_config_t*c,nrfx_spim_evt_handler_t h,void*x) {(void)s;(void)c;(void)x;assert(h);return 0;}
uint32_t nrfx_spim_xfer(const nrfx_spim_t*s,const nrfx_spim_xfer_desc_t*d,uint32_t f) {
    (void)s;(void)f;assert(masked&&selected);transfers++;
    if(fail_at&&transfers==fail_at)return 77;
    if(d->tx_length){if(!command){command=d->p_tx_buffer[0];
        if(d->tx_length==4)wire_address=((uint32_t)d->p_tx_buffer[1]<<16)|((uint32_t)d->p_tx_buffer[2]<<8)|d->p_tx_buffer[3];
    }else if(command==CMD_PP)payload=true;}
    if(d->rx_length){
        unsigned value=0;
        if(command==CMD_RDSR1){polls++;ticks=(ticks+tick_step)&0xffffffu;value=wel?FLASH_STATUS_WEL:0;
            if(stuck||busy_left){value|=FLASH_STATUS_BUSY;if(busy_left)busy_left--;}}
        memset(d->p_rx_buffer,value,d->rx_length);
        if(command==CMD_JEDEC_ID&&d->rx_length==3){d->p_rx_buffer[0]=0xef;d->p_rx_buffer[1]=0x40;d->p_rx_buffer[2]=0x17;}
    }
    s->p_reg->TXD.AMOUNT=d->tx_length;s->p_reg->RXD.AMOUNT=d->rx_length;
    s->p_reg->events[NRF_SPIM_EVENT_END]=true;
    return 0;
}
static void reset(void){
    masked=selected=in_irq=inject_read=injected=wel=deny_wel=stuck=post_stuck=false;
    command=transfers=fail_at=commits=erases=polls=busy_left=post_busy=enters=exits=wrdi=0;
    ticks=wire_address=0;tick_step=1;m_dev.cs_pin=FLASH_CS_PIN;
}
static void clean(void){assert(!selected&&!masked&&enters==exits);}
static ret_code_t operation(unsigned op){uint8_t data[16]={0};flash_info_t info;
    if(op==0)return hal_spi_flash_read(0x1000,data,sizeof data);
    if(op==1)return hal_spi_flash_prog(0x1000,data,sizeof data);
    if(op==2)return hal_spi_flash_erase(0x1000);
    if(op==3)return hal_spi_flash_info(&info);
    return hal_spi_flash_init();
}
int main(void){
    unsigned injected_errors=0;
    for(unsigned op=0;op<5;op++){
        reset();busy_left=3;post_busy=3;assert(operation(op)==NRF_SUCCESS);clean();unsigned total=transfers;
        for(unsigned error=1;error<=total;error++){
            reset();busy_left=3;post_busy=3;fail_at=error;
            assert(operation(op)==77);assert(transfers==error);clean();injected_errors++;
        }
    }
    printf("PASS all %u command/data/status-transfer error points return unchanged error and release CS\n",injected_errors);
    for(unsigned op=0;op<3;op++){
        reset();stuck=true;assert(operation(op)==NRF_ERROR_TIMEOUT);assert(polls<=5001&&!commits&&!erases);clean();
        reset();ticks=0xfffff0;stuck=true;assert(operation(op)==NRF_ERROR_TIMEOUT);assert(polls<=5001);clean();
    }
    puts("PASS ready timeout and 24-bit RTC wrap for read/program/erase");
    reset();post_stuck=true;assert(operation(1)==NRF_ERROR_TIMEOUT);assert(commits==1&&polls<=103);clean();
    reset();post_stuck=true;assert(operation(2)==NRF_ERROR_TIMEOUT);assert(erases==1&&polls<=5003);clean();
    puts("PASS program/erase completion timeout never reports success");
    reset();tick_step=0;stuck=true;assert(operation(0)==NRF_ERROR_TIMEOUT);assert(polls==FLASH_BUSY_POLL_LIMIT);clean();
    puts("PASS stopped-clock fallback remains finite");
    for(unsigned op=1;op<=2;op++){reset();deny_wel=true;assert(operation(op)==NRF_ERROR_INVALID_STATE);assert(!commits&&!erases);clean();}
    puts("PASS refused WEL prevents program and erase");
    reset();inject_read=true;assert(operation(1)==NRF_SUCCESS);assert(injected&&commits==1&&!wrdi);clean();
    puts("PASS interleaved read no longer clears WEL; all individual transactions remain exclusive");
    reset();assert(hal_spi_flash_read(0,NULL,1)==NRF_ERROR_INVALID_PARAM);assert(hal_spi_flash_prog(0,NULL,1)==NRF_ERROR_INVALID_PARAM);
    assert(hal_spi_flash_info(NULL)==NRF_ERROR_INVALID_PARAM);assert(hal_spi_flash_read(0,NULL,0)==0&&hal_spi_flash_prog(0,NULL,0)==0);assert(!transfers);
    flash_info_t info={1,2,3};fail_at=1;assert(hal_spi_flash_info(&info)==77&&info.block_count==0);clean();
    puts("PASS invalid input, zero-length no-op and failed ID never expose uninitialized geometry");
    uint8_t bytes[256]={0};
    const uint32_t bad_addresses[]={0x01000000u,0x01000001u,0xffffffffu};
    for(unsigned i=0;i<sizeof bad_addresses/sizeof bad_addresses[0];i++){
        reset();assert(hal_spi_flash_read(bad_addresses[i],bytes,1)==NRF_ERROR_INVALID_PARAM);
        assert(hal_spi_flash_prog(bad_addresses[i],bytes,1)==NRF_ERROR_INVALID_PARAM);
        assert(hal_spi_flash_erase(bad_addresses[i])==NRF_ERROR_INVALID_PARAM);assert(!transfers&&!enters);
        assert(hal_spi_flash_read(bad_addresses[i],NULL,0)==NRF_SUCCESS);
        assert(hal_spi_flash_prog(bad_addresses[i],NULL,0)==NRF_SUCCESS);assert(!transfers&&!enters);
    }
    reset();assert(hal_spi_flash_read(0x00ffffffu,bytes,2)==NRF_ERROR_INVALID_PARAM);
    assert(hal_spi_flash_prog(0x00ffffffu,bytes,2)==NRF_ERROR_INVALID_PARAM);
    assert(hal_spi_flash_read(1,bytes,SIZE_MAX)==NRF_ERROR_INVALID_PARAM);
    assert(hal_spi_flash_prog(1,bytes,SIZE_MAX)==NRF_ERROR_INVALID_PARAM);assert(!transfers&&!enters);
    reset();assert(hal_spi_flash_read(0x00fffffeu,bytes,2)==NRF_SUCCESS&&wire_address==0x00fffffeu);clean();
    reset();assert(hal_spi_flash_prog(0x00ffffffu,bytes,1)==NRF_SUCCESS&&wire_address==0x00ffffffu&&commits==1);clean();
    reset();assert(hal_spi_flash_prog(0x00ffff00u,bytes,256)==NRF_SUCCESS&&wire_address==0x00ffff00u&&commits==1);clean();
    reset();assert(hal_spi_flash_erase(0x00ffffffu)==NRF_SUCCESS&&wire_address==0x00ffffffu&&erases==1);clean();
    reset();assert(hal_spi_flash_prog(0x1001,bytes,256)==NRF_ERROR_INVALID_PARAM);
    assert(hal_spi_flash_prog(0x10ff,bytes,2)==NRF_ERROR_INVALID_PARAM);assert(!transfers&&!enters);
    assert(hal_spi_flash_prog(0x10ff,bytes,1)==NRF_SUCCESS&&commits==1);clean();
    puts("PASS 24-bit address/range and page-crossing guards before every SPI command; last byte/page/sector and zero-length controls");
}
'''

NFC_MODEL = r'''
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include <assert.h>
typedef struct { uint32_t EVENTS_RXFRAMEEND,INTEN,EVENTS_RXERROR,INTENCLR; struct {uint32_t AMOUNT;} RXD; struct {uint32_t RX;} FRAMESTATUS;} nfct_t;
static nfct_t hardware;
#define NRF_NFCT (&hardware)
#define NFCT_INTEN_RXFRAMEEND_Msk 1u
#define NFCT_INTEN_RXERROR_Msk 2u
#define NFCT_RXD_AMOUNT_RXDATABYTES_Msk (0x1ffu<<3)
#define NFCT_RXD_AMOUNT_RXDATABYTES_Pos 3
#define NFCT_RXD_AMOUNT_RXDATABITS_Msk 7u
#define NRF_NFCT_FRAMESTATUS_RX_MSK 7u
#define NFCT_INTENCLR_RXFRAMEEND_Clear 1u
#define NFCT_INTENCLR_RXFRAMEEND_Pos 0
#define NFC_CRC_SIZE 2u
#define NFC_SLP_REQ_CMD 0x50u
#define HAL_NFC_EVENT_COMMAND 1
#define NRF_LOG_DEBUG(...) ((void)0)
static uint8_t m_nfc_rx_buffer[72];
static bool m_slp_req_received;
static unsigned callbacks,resets;
static size_t received_size;
static void*m_nfc_lib_context;
static void callback(void*c,int e,void*b,size_t n){(void)c;(void)e;assert(b==m_nfc_rx_buffer);callbacks++;received_size=n;}
static void(*m_nfc_lib_callback)(void*,int,void*,size_t)=callback;
static void nrf_nfct_event_clear(uint32_t*e){*e=0;}
static void nrf_nfct_default_state_reset(void){resets++;}
static void actual_rx(void){ /* ACTUAL_RX */ }
int main(void){unsigned cases=0;
    for(unsigned bytes=0;bytes<=511;bytes++)for(unsigned bits=0;bits<8;bits++)for(unsigned error=0;error<2;error++){
        memset(&hardware,0,sizeof hardware);memset(m_nfc_rx_buffer,0,sizeof m_nfc_rx_buffer);m_nfc_rx_buffer[0]=0x30;
        callbacks=resets=0;received_size=0;hardware.EVENTS_RXFRAMEEND=1;hardware.INTEN=3;hardware.RXD.AMOUNT=(bytes<<3)|bits;
        if(error){hardware.EVENTS_RXERROR=1;hardware.FRAMESTATUS.RX=1;}
        actual_rx();bool valid=bytes>2&&bytes<=72&&!bits&&!error;
        if(valid)assert(callbacks==1&&!resets&&received_size==bytes-2);
        else assert(!callbacks&&resets==1);
        cases++;
    }
    memset(&hardware,0,sizeof hardware);hardware.EVENTS_RXFRAMEEND=1;hardware.INTEN=3;hardware.RXD.AMOUNT=4<<3;
    m_nfc_rx_buffer[0]=NFC_SLP_REQ_CMD;callbacks=resets=0;m_slp_req_received=false;
    actual_rx();assert(m_slp_req_received&&!callbacks&&!resets&&hardware.INTENCLR==1);
    printf("PASS %u exhaustive byte/bit/error combinations and valid SLP_REQ control\n",cases);
}
'''

ADAPTER_MODEL = r'''
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <assert.h>
#include <stdio.h>
typedef int32_t s32_t;typedef uint32_t u32_t;typedef uint8_t u8_t;
typedef uint32_t lfs_block_t;typedef uint32_t lfs_off_t;typedef uint32_t lfs_size_t;
struct lfs_config{uint32_t block_size,block_count;};
/* ACTUAL_LFS_CONSTANTS */
#define NRF_SUCCESS 0
#define SPIFFS_OK 0
#define SPIFFS_ERR_INTERNAL -10050
#define LFS_ERR_IO -5
static uint32_t result,calls;
static uint32_t hal_spi_flash_read(uint32_t a,void*b,size_t n){(void)a;(void)b;(void)n;calls++;return result;}
static uint32_t hal_spi_flash_prog(uint32_t a,const void*b,size_t n){(void)a;(void)b;(void)n;calls++;return result;}
static uint32_t hal_spi_flash_erase(uint32_t a){(void)a;calls++;return result;}
/* ACTUAL_ADAPTERS */
int main(void){struct lfs_config c={4096,512};uint8_t byte=0, page[LFS_CACHE_SIZE]={0};
    for(unsigned i=0;i<256;i++){result=i;int expected=i?SPIFFS_ERR_INTERNAL:0;
        assert(spiffs_block_read(0,1,&byte)==expected&&spiffs_block_write(0,1,&byte)==expected&&spiffs_block_erase(0,4096)==expected);
        expected=i?LFS_ERR_IO:0;assert(block_device_read(&c,0,0,&byte,1)==expected&&block_device_prog(&c,0,0,page,sizeof(page))==expected&&block_device_erase(&c,0)==expected);
    }
    puts("PASS 256 HAL status values map to zero success or negative SPIFFS/LFS failure");
    result=0;calls=0;
    assert(block_device_read(NULL,0,0,&byte,1)==LFS_ERR_IO);
    assert(block_device_prog(NULL,0,0,page,sizeof(page))==LFS_ERR_IO);
    assert(block_device_erase(NULL,0)==LFS_ERR_IO);
    assert(block_device_read(&c,512,0,&byte,1)==LFS_ERR_IO);
    assert(block_device_prog(&c,512,0,page,sizeof(page))==LFS_ERR_IO);
    assert(block_device_erase(&c,512)==LFS_ERR_IO);
    assert(block_device_read(&c,0,4096,&byte,1)==LFS_ERR_IO);
    assert(block_device_read(&c,0,1,&byte,UINT32_MAX)==LFS_ERR_IO);
    assert(block_device_read(&c,0,0,NULL,1)==LFS_ERR_IO);
    assert(block_device_prog(&c,0,0,NULL,256)==LFS_ERR_IO);
    assert(block_device_prog(&c,0,1,page,256)==LFS_ERR_IO);
    assert(block_device_prog(&c,0,0,page,1)==LFS_ERR_IO);
    assert(block_device_prog(&c,0,4096,page,256)==LFS_ERR_IO);
    c.block_count=0;assert(block_device_read(&c,0,0,&byte,1)==LFS_ERR_IO);
    c.block_count=4097;assert(block_device_erase(&c,0)==LFS_ERR_IO);
    c.block_count=512;c.block_size=8192;assert(block_device_erase(&c,0)==LFS_ERR_IO);
    assert(calls==0);
    c.block_size=4096;c.block_count=4096;
    assert(block_device_read(&c,4095,4095,&byte,1)==0);
    assert(block_device_prog(&c,4095,3840,page,256)==0);
    assert(block_device_erase(&c,4095)==0 && calls==3);
    puts("PASS 16 LFS geometry/range/null/alignment guards reject before HAL; final physical page succeeds");
}
'''

def brace_block(source,marker):
    start=source.index(marker); opening=source.index('{',start);depth=1;end=opening+1
    while depth:depth+=(source[end]=='{')-(source[end]=='}');end+=1
    return source[start:end]

def main():
    cc=shutil.which('gcc')
    if not cc:raise RuntimeError('Existing gcc required, no skipped tests')
    with tempfile.TemporaryDirectory(prefix='pixl-hal-reliability-') as tmp:
        folder=Path(tmp);(folder/'mock_sdk.h').write_text(STUB,encoding='utf-8')
        for header in ['app_error.h','app_util_platform.h','app_timer.h','boards.h','nrfx_spim.h','nrf_delay.h','nrf_gpio.h','nrf_log.h','nrf_log_ctrl.h','nordic_common.h','nrf_drv_spi.h','nrf_error.h','nrfx.h']:
            (folder/header).write_text('#include "mock_sdk.h"\n',encoding='utf-8')
        flash='#include "mock_sdk.h"\n'+''.join('#include "'+str(SRC/'hal'/name).replace('\\','/')+'"\n' for name in ['hal_spi_bus.c','hal_spi_flash.c'])+FLASH_MODEL
        nfc_source=(SRC/'hal/hal_nfc_t2t.c').read_text(encoding='utf-8')
        nfc=NFC_MODEL.replace('/* ACTUAL_RX */',brace_block(nfc_source,'if (NRF_NFCT->EVENTS_RXFRAMEEND &&'))
        spiffs=(SRC/'mod/vfs/vfs_driver_spiffs.c').read_text(encoding='utf-8');lfs=(SRC/'mod/vfs/vfs_driver_lfs.c').read_text(encoding='utf-8')
        constants='\n'.join(re.search(r'^#define '+name+r'[^\n]+',lfs,re.M).group() for name in ['LFS_CACHE_SIZE','LFS_BLOCK_SIZE'])
        adapters=ADAPTER_MODEL.replace('/* ACTUAL_LFS_CONSTANTS */',constants).replace('/* ACTUAL_ADAPTERS */','\n'.join(function(spiffs,n) for n in ['spiffs_block_read','spiffs_block_write','spiffs_block_erase'])+'\n'+'\n'.join(function(lfs,n) for n in ['block_range','block_device_read','block_device_prog','block_device_erase']))
        for name,code in [('flash',flash),('nfc',nfc),('adapters',adapters)]:
            source=folder/(name+'.c');binary=folder/(name+('.exe' if os.name=='nt' else ''));source.write_text(code,encoding='utf-8')
            cmd=[cc,'-std=c11','-O1','-g','-Wall','-Wextra','-Werror','-Wno-unused-parameter','-I',str(folder)]
            if os.environ.get('PIXL_SANITIZE')=='1':cmd+=['-fsanitize=address,undefined','-fno-omit-frame-pointer']
            subprocess.run(cmd+[str(source),'-o',str(binary)],check=True,timeout=60)
            subprocess.run([str(binary)],check=True,timeout=45)
    print('PASS actual-source Flash/NFC/adapter reliability suites')

if __name__=='__main__':main()
