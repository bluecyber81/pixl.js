"""Actual HAL C tests with deterministic application-IRQ injection; no device access."""
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import unittest

HERE = Path(__file__).resolve().parent / 'spi_fixture'
FIRMWARE_ROOT = Path(__file__).resolve().parents[3]

def function(text, name):
    match = re.search(r'\b' + re.escape(name) + r'\s*\([^;{}]*\)\s*\{', text)
    assert match, name
    begin = text.rfind('\n', 0, match.start()) + 1
    pos = text.index('{', match.start())
    depth = 1
    end = pos + 1
    while depth:
        depth += (text[end] == '{') - (text[end] == '}')
        end += 1
    return text[begin:end] + '\n'

STUB = r'''
#ifndef MOCK_SDK_H
#define MOCK_SDK_H
#include <assert.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <setjmp.h>
typedef uint32_t ret_code_t;
typedef struct { struct {uint32_t AMOUNT;} TXD,RXD; bool events[2]; } NRF_SPIM_Type;
typedef enum {NRF_SPIM_EVENT_END,NRF_SPIM_EVENT_STOPPED} nrf_spim_event_t;
enum {NRF_SPIM_TASK_STOP};
static NRF_SPIM_Type mock_spim;
typedef struct { unsigned id; NRF_SPIM_Type *p_reg; } nrfx_spim_t;
typedef struct {unsigned unused;} nrfx_spim_evt_t;
typedef void (*nrfx_spim_evt_handler_t)(nrfx_spim_evt_t const *,void *);
typedef struct { unsigned sck_pin,mosi_pin,miso_pin,frequency,mode; bool ss_active_high; } nrfx_spim_config_t;
typedef struct { const uint8_t *p_tx_buffer; uint8_t *p_rx_buffer; size_t tx_length,rx_length; } nrfx_spim_xfer_desc_t;
typedef struct { int unused; } u8x8_t;
#define NRFX_SPIM_INSTANCE(n) {n,&mock_spim}
#define NRFX_SPIM_FLAG_NO_XFER_EVT_HANDLER 4u
#define NRFX_SPIM_DEFAULT_CONFIG {0}
#define NRFX_SPIM_SCK_PIN 1
#define NRFX_SPIM_MOSI_PIN 2
#define NRFX_SPIM_MISO_PIN 3
#define NRF_SPIM_FREQ_8M 8000000
#define NRF_SPIM_MODE_0 0
#define NRF_SUCCESS 0
#define NRF_ERROR_INTERNAL 3
#define NRF_ERROR_INVALID_PARAM 7
#define NRF_ERROR_INVALID_STATE 8
#define NRF_ERROR_TIMEOUT 13
#define NRF_ERROR_DATA_SIZE 12
#define APP_TIMER_TICKS(ms) (ms)
#define LCD_CS_PIN 10
#define FLASH_CS_PIN 20
#define LCD_DC_PIN 11
#define U8X8_MSG_BYTE_SEND 1
#define U8X8_MSG_BYTE_SET_DC 2
#define U8X8_MSG_BYTE_START_TRANSFER 3
#define U8X8_MSG_BYTE_END_TRANSFER 4
#define NRF_LOG_INFO(...) ((void)0)
#define NRF_LOG_DEBUG(...) ((void)0)
#define NRF_LOG_WARNING(...) ((void)0)
#define NRF_LOG_HEXDUMP_DEBUG(...) ((void)0)
void mock_error(uint32_t error);
#define APP_ERROR_CHECK(error) do { uint32_t e_=(error); if(e_) mock_error(e_); } while(0)
#define APP_ERROR_HANDLER(error) mock_error(error)
/* A host reset ends this test process without a Windows CRT abort dialog. */
#define MOCK_SYSTEM_RESET_EXIT 86
static inline __attribute__((noreturn)) void NVIC_SystemReset(void) { _Exit(MOCK_SYSTEM_RESET_EXIT); }
#ifndef MOCK_SPIM_CUSTOM_EVENTS
static inline bool nrf_spim_event_check(NRF_SPIM_Type*r,nrf_spim_event_t e) {return r->events[e];}
static inline void nrf_spim_event_clear(NRF_SPIM_Type*r,nrf_spim_event_t e) {r->events[e]=false;}
static inline void nrf_spim_task_trigger(NRF_SPIM_Type*r,unsigned t) {(void)t;r->events[NRF_SPIM_EVENT_STOPPED]=true;}
#else
bool nrf_spim_event_check(NRF_SPIM_Type*,nrf_spim_event_t);
void nrf_spim_event_clear(NRF_SPIM_Type*,nrf_spim_event_t);
void nrf_spim_task_trigger(NRF_SPIM_Type*,unsigned);
#endif
uint32_t nrfx_spim_init(const nrfx_spim_t*,const nrfx_spim_config_t*,nrfx_spim_evt_handler_t,void*);
uint32_t nrfx_spim_xfer(const nrfx_spim_t*,const nrfx_spim_xfer_desc_t*,uint32_t);
void app_util_critical_region_enter(uint8_t*);
void app_util_critical_region_exit(uint8_t);
void nrf_gpio_cfg_output(uint32_t);
void nrf_gpio_pin_set(uint32_t);
void nrf_gpio_pin_clear(uint32_t);
void nrf_gpio_pin_write(uint32_t,uint32_t);
void u8x8_gpio_SetDC(u8x8_t*,uint8_t);
uint32_t app_timer_cnt_get(void);
uint32_t app_timer_cnt_diff_compute(uint32_t,uint32_t);
#endif
'''

HARNESS = r'''
static bool app_masked, pending_irq, in_irq, injected, radio_enabled=true;
static unsigned selected, dual_cs, irq_count, critical_enters, critical_exits;
static unsigned transfers, fail_transfer, error_count, lcd_chunks, lcd_chunks_seen_by_irq;
static unsigned stage, busy_remaining, busy_responses, polls_seen_by_irq;
static uint8_t flash_command;
static bool expect_error;
static jmp_buf error_jump;
uint32_t app_timer_cnt_get(void) { return transfers; }
uint32_t app_timer_cnt_diff_compute(uint32_t now,uint32_t then) { return (now-then)&0xffffffu; }

/* Models the SDK's application-mask/nested-token contract, not a global
 * PRIMASK lock. The actual SDK implementation is separately source-pinned. */
static void dispatch_irq(void) {
    if (!pending_irq || app_masked || in_irq) return;
    assert(radio_enabled);
    pending_irq=false; in_irq=true; irq_count++;
    lcd_chunks_seen_by_irq=lcd_chunks;
    polls_seen_by_irq=busy_responses;
    uint8_t bytes[12];
    assert(hal_spi_flash_read(0x1234,bytes,sizeof(bytes))==NRF_SUCCESS);
    for(size_t i=0;i<sizeof(bytes);++i) assert(bytes[i]==0xa5);
    in_irq=false;
}
static void inject(unsigned point) {
    if (!in_irq && !injected && stage==point) {
        injected=true; pending_irq=true; dispatch_irq();
    }
}
void app_util_critical_region_enter(uint8_t *nested) {
    *nested=app_masked; app_masked=true; critical_enters++;
    assert(radio_enabled);
}
void app_util_critical_region_exit(uint8_t nested) {
    assert(app_masked); critical_exits++;
    if (!nested) app_masked=false;
    assert(radio_enabled);
    dispatch_irq();
}
void nrf_gpio_cfg_output(uint32_t pin) { (void)pin; }
void nrf_gpio_pin_clear(uint32_t pin) {
    selected |= 1u<<pin;
    if ((selected&(1u<<LCD_CS_PIN)) && (selected&(1u<<FLASH_CS_PIN))) dual_cs++;
    if(pin==LCD_CS_PIN) inject(1); /* after CS-low, before first byte */
}
void nrf_gpio_pin_set(uint32_t pin) {
    selected &= ~(1u<<pin);
    if(pin==LCD_CS_PIN) inject(4); /* after CS-high, before mask restore */
}
void nrf_gpio_pin_write(uint32_t pin,uint32_t value) {(void)pin;(void)value;}
void u8x8_gpio_SetDC(u8x8_t *device,uint8_t value) {(void)device;(void)value;}
uint32_t nrfx_spim_init(const nrfx_spim_t *spi,const nrfx_spim_config_t *config,nrfx_spim_evt_handler_t handler,void *context) {
    (void)spi;(void)config;(void)context; assert(GUARDED ? handler!=NULL : handler==NULL); return NRF_SUCCESS;
}
uint32_t nrfx_spim_xfer(const nrfx_spim_t *spi,const nrfx_spim_xfer_desc_t *desc,uint32_t flags) {
    (void)spi;(void)flags; transfers++;
    assert(desc->tx_length<=128 && desc->rx_length<=128);
    assert(selected!=0);
    if(fail_transfer && transfers==fail_transfer) return 77;
    if((selected&(1u<<LCD_CS_PIN)) && !in_irq) {
        lcd_chunks++;
        if(desc->tx_length==128) inject(2); /* between DMA chunks */
    }
    if(selected&(1u<<FLASH_CS_PIN)) {
        if(desc->tx_length) {
            flash_command=desc->p_tx_buffer[0];
            if(flash_command==0x03 && desc->tx_length==4) inject(3); /* command/RX boundary */
        }
        if(desc->rx_length) {
            uint8_t fill=flash_command==0x03 ? 0xa5 : 0;
            if(flash_command==0x05 && busy_remaining && !in_irq) {
                fill=1; busy_remaining--; busy_responses++; inject(10);
            }
            memset(desc->p_rx_buffer,fill,desc->rx_length);
        }
    }
    spi->p_reg->TXD.AMOUNT=desc->tx_length;spi->p_reg->RXD.AMOUNT=desc->rx_length;
    spi->p_reg->events[NRF_SPIM_EVENT_END]=true;
    return NRF_SUCCESS;
}
void mock_error(uint32_t error) {
    assert(error==77 && expect_error);
    /* Every fatal caller must release its CS and application mask first. */
    assert(selected==0 && !app_masked);
    error_count++;
    longjmp(error_jump,1);
}
static void reset_state(void) {
    app_masked=pending_irq=in_irq=injected=expect_error=false;
    selected=dual_cs=irq_count=critical_enters=critical_exits=transfers=0;
    fail_transfer=error_count=lcd_chunks=lcd_chunks_seen_by_irq=0;
    busy_remaining=busy_responses=polls_seen_by_irq=stage=0;
    flash_command=0; radio_enabled=true;
    lcd_device.cs_pin=LCD_CS_PIN;
    m_dev.cs_pin=FLASH_CS_PIN;
}
static void lcd_send(void) {
    uint8_t bytes[255]={0};
    assert(u8x8_HW_com_spi_nrf52832(NULL,U8X8_MSG_BYTE_SEND,sizeof(bytes),bytes)==1);
}
int main(int argc,char **argv) {
    assert(argc==2); unsigned scenario=(unsigned)atoi(argv[1]);
    reset_state(); hal_spi_bus_init();
    if(scenario==1 || scenario==2 || scenario==4) {
        stage=scenario; lcd_send();
        assert(injected && irq_count==1 && selected==0 && !app_masked && !pending_irq);
        if(GUARDED) {
            assert(dual_cs==0 && lcd_chunks_seen_by_irq==2);
            assert(critical_enters==critical_exits);
        } else {
            assert(scenario!=4 && dual_cs>0); puts("RACE_REPRODUCED"); return 0;
        }
    } else if(scenario==3) {
        stage=3; uint8_t bytes[256];
        hal_spi_flash_read(0x5678,bytes,sizeof(bytes));
        for(size_t i=0;i<sizeof(bytes);i++) assert(bytes[i]==0xa5);
        assert(irq_count==1 && dual_cs==0 && selected==0 && !app_masked);
    } else if(scenario==5) {
        uint8_t outer; app_util_critical_region_enter(&outer); stage=1;
        lcd_send(); assert(injected && pending_irq && irq_count==0 && app_masked && selected==0);
        app_util_critical_region_exit(outer);
        assert(irq_count==1 && !app_masked && !pending_irq && dual_cs==0);
    } else if(scenario>=6 && scenario<=9) {
        fail_transfer=(scenario==6 || scenario==8) ? 1 : 2;
#if GUARDED
        uint8_t command[4]={3,0,0,0}, data[8]={0};
        uint32_t result = scenario<=7 ? hal_spi_flash_write_read(command,4,data,sizeof(data)) :
                                       hal_spi_flash_write_write(command,4,data,sizeof(data));
        assert(result==77 && error_count==0 && selected==0 && !app_masked);
        assert(critical_enters==critical_exits);
#else
        expect_error=true;
        if(setjmp(error_jump)==0) {
            uint8_t command[4]={3,0,0,0}, data[8]={0};
            if(scenario<=7) hal_spi_flash_write_read(command,4,data,sizeof(data));
            else hal_spi_flash_write_write(command,4,data,sizeof(data));
            assert(!"expected HAL failure");
        }
        assert(error_count==1 && critical_enters==critical_exits);
#endif
    } else if(scenario==10) {
        busy_remaining=3; stage=10;
        uint8_t bytes[8]; hal_spi_flash_read(0x5678,bytes,sizeof(bytes));
        assert(irq_count==1 && polls_seen_by_irq==1 && busy_responses==3);
        assert(!app_masked && selected==0 && critical_enters==critical_exits);
    } else if(scenario==11) {
        stage=1; JOY_OLED_data_start(0);
        for(unsigned i=0;i<128;i++) JOY_OLED_send((uint8_t)i);
        assert(app_masked && irq_count==0 && pending_irq);
        JOY_OLED_end();
        assert(irq_count==1 && lcd_chunks_seen_by_irq==131 && dual_cs==0 && !app_masked);
    } else if(scenario==12) {
        expect_error=true; fail_transfer=1;
        if(setjmp(error_jump)==0) {JOY_OLED_data_start(0); assert(!"expected game failure");}
        assert(error_count==1 && critical_enters==critical_exits);
    } else assert(!"unknown scenario");
    assert(radio_enabled && selected==0 && !app_masked && critical_enters==critical_exits);
    puts("PASS"); return 0;
}
'''

class TransactionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='pixl-spi-review-')
        cls.folder = Path(cls.temp.name)
        compiler = shutil.which('gcc')
        if not compiler:
            raise RuntimeError('Existing gcc is required; refusing an untested PASS')
        sdk_headers = ['app_error.h','app_util_platform.h','app_timer.h','boards.h','nrfx_spim.h','nrf_delay.h',
                       'nrf_gpio.h','nrf_log.h','nrf_log_ctrl.h','nordic_common.h','nrf_drv_spi.h','nrf_error.h','nrfx.h']
        (cls.folder/'mock_sdk.h').write_text(STUB, encoding='utf-8')
        for header in sdk_headers:
            (cls.folder/header).write_text('#include "mock_sdk.h"\n', encoding='utf-8')
        cls.binaries = {}
        for guarded, tree in [(False,HERE/'baseline'),(True,FIRMWARE_ROOT)]:
            src=tree/'fw/application/src'
            u8=(src/'mui/mui_u8g2.c').read_text(encoding='utf-8')
            game=(src/'app/game/port/common/driver.c').read_text(encoding='utf-8')
            source='#include "mock_sdk.h"\n'
            source+='#include "'+(src/'hal/hal_spi_bus.c').as_posix()+'"\n'
            source+='#include "'+(src/'hal/hal_spi_flash.c').as_posix()+'"\n'
            source+='static spi_device_t lcd_device;\n'
            source+='static spi_device_t *mui_u8g2_get_spi_device(void) {return &lcd_device;}\n'
            source+='#define m_dev lcd_device\n'+function(u8,'u8x8_HW_com_spi_nrf52832')+'#undef m_dev\n'
            for name in ['JOY_OLED_end','JOY_OLED_write_data','JOY_OLED_write_cmd','JOY_OLED_set_pos',
                         'JOY_OLED_send','JOY_OLED_data_start']:
                source+=function(game,name)
            source+=HARNESS
            path=cls.folder/('guarded.c' if guarded else 'baseline.c')
            path.write_text(source, encoding='utf-8')
            binary=path.with_suffix('.exe')
            cmd=[compiler,'-std=gnu11','-Wall','-Wextra','-Werror','-Wno-unused-parameter',
                 '-Wno-unused-function','-Wno-unused-variable','-Wno-sign-compare','-Wno-parentheses',
                 '-DGUARDED='+str(int(guarded)),'-I',str(cls.folder),'-I',str(src/'hal')]
            if os.environ.get('PIXL_SANITIZE')=='1':
                cmd+=['-g','-O1','-fsanitize=address,undefined','-fno-omit-frame-pointer']
            result=subprocess.run(cmd+[str(path),'-o',str(binary)],capture_output=True,text=True,timeout=60)
            if result.returncode:
                raise AssertionError(result.stdout+result.stderr)
            cls.binaries[guarded]=binary

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def case(self,n,guarded=True):
        result=subprocess.run([str(self.binaries[guarded]),str(n)],capture_output=True,text=True,timeout=10)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertIn('PASS' if guarded else 'RACE_REPRODUCED',result.stdout)

    def test_baseline_reproduces_lcd_cs_and_dma_race(self):
        self.case(1,False); self.case(2,False)
    def test_irq_after_cs_assertion_is_deferred_until_full_transfer(self): self.case(1)
    def test_irq_during_128_byte_chunk_cannot_replace_dma(self): self.case(2)
    def test_flash_command_and_rx_remain_one_transaction(self): self.case(3)
    def test_irq_after_cs_high_reuses_device_only_after_restore(self): self.case(4)
    def test_preexisting_outer_critical_region_remains_masked(self): self.case(5)
    def test_read_command_failure_releases_before_error_return(self): self.case(6)
    def test_read_rx_failure_releases_before_error_return(self): self.case(7)
    def test_write_command_failure_releases_before_error_return(self): self.case(8)
    def test_write_payload_failure_releases_before_error_return(self): self.case(9)
    def test_busy_poll_yields_between_individual_status_transactions(self): self.case(10)
    def test_game_row_131_transfers_is_atomic_without_duration_claim(self): self.case(11)
    def test_game_transfer_failure_releases_before_error_handler(self): self.case(12)
    def test_baseline_fixture_matches_frozen_DE3_source_hashes(self):
        pins=json.loads((HERE/'original_source_pins.json').read_text())
        original=HERE/'baseline'
        for name,pin in pins.items():
            self.assertEqual(hashlib.sha256((original/name).read_bytes()).hexdigest(),pin['sha256'])
    def test_historical_patch_applies_and_matches_pinned_DE3_1_result(self):
        with tempfile.TemporaryDirectory(prefix='pixl-spi-patch-') as temp:
            fresh=Path(temp)
            shutil.copytree(HERE/'baseline',fresh,dirs_exist_ok=True)
            # Git for Windows accepts the fixture's CRLF while Linux Git does
            # not. Normalize only temporary copies; raw fixture pins above
            # remain unchanged and the expected output hashes use LF text.
            for name in json.loads((HERE/'original_source_pins.json').read_text()):
                copied=fresh/name
                copied.write_bytes(copied.read_text(encoding='utf-8').encode('utf-8'))
            patch=fresh/'historical_spi.patch'
            patch.write_bytes((HERE/'spi_transaction_guard.patch').read_text(encoding='utf-8').encode('utf-8'))
            for option in ('--check',None):
                command=['git','-C',str(fresh),'apply']+([option] if option else [])+[str(patch)]
                result=subprocess.run(command,capture_output=True,text=True,timeout=10)
                self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            # This historical patch predates the DE3.2 HAL error-return changes.
            # Keep its result pinned; positive runtime tests above still include
            # the actual current firmware sources, not this historical fixture.
            pins=json.loads((HERE/'de3_1_guarded_source_pins.json').read_text())
            for name in json.loads((HERE/'original_source_pins.json').read_text()):
                normalized=(fresh/name).read_text(encoding='utf-8').encode('utf-8')
                self.assertEqual(hashlib.sha256(normalized).hexdigest(),pins[name])

if __name__=='__main__': unittest.main(verbosity=2)
