/**
 * Copyright (c) 2015 - 2021, Nordic Semiconductor ASA
 *
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form, except as embedded into a Nordic
 *    Semiconductor ASA integrated circuit in a product or a software update for
 *    such product, must reproduce the above copyright notice, this list of
 *    conditions and the following disclaimer in the documentation and/or other
 *    materials provided with the distribution.
 *
 * 3. Neither the name of Nordic Semiconductor ASA nor the names of its
 *    contributors may be used to endorse or promote products derived from this
 *    software without specific prior written permission.
 *
 * 4. This software, with or without modification, must only be used with a
 *    Nordic Semiconductor ASA integrated circuit.
 *
 * 5. Any software provided in binary form under this license must not be reverse
 *    engineered, decompiled, modified and/or disassembled.
 *
 * THIS SOFTWARE IS PROVIDED BY NORDIC SEMICONDUCTOR ASA "AS IS" AND ANY EXPRESS
 * OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
 * OF MERCHANTABILITY, NONINFRINGEMENT, AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL NORDIC SEMICONDUCTOR ASA OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
 * GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
 * LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
 * OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 */
/* SDK function below copied verbatim from pinned SDK17.1 nrfx_saadc.c, SHA256 5714ad6a0ff262be0d529c2e5a7dd266b4641e202f437d57484c73ff8764fd4f.
 * Release-mode END timeout modeled without DMA output; no hardware test. */
/* Includes the unchanged current battery C implementation with mocked SDK I/O. */
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <stddef.h>
typedef int ret_code_t;
typedef int16_t nrf_saadc_value_t;
typedef struct { int type; } nrf_drv_saadc_evt_t;
typedef struct { int input; } nrf_saadc_channel_config_t;
typedef struct { bool bat_mode; uint8_t sleep_timeout_sec; } settings_data_t;
static settings_data_t settings;
static int init_result, channel_result, sample_result;
static int adc_sample = 768, charge_pin = 1;
static int init_calls, channel_calls, sample_calls, uninit_calls, channel_uninit_calls;
static int gpio_reads, gpio_configs, last_adc_input, callbacks, timer_period;
static void (*timer_cb)(void *);
#define NRF_SUCCESS 0
#define NRF_SAADC_INPUT_AIN0 7
#define NRF_SAADC_INPUT_VDD 9
#define NRF_GPIO_PIN_PULLUP 3
#define CHRG_PIN 3
#define NRF_DRV_SAADC_DEFAULT_CHANNEL_CONFIG_SE(value) { value }
#define APP_TIMER_DEF(name) static int name
#define APP_TIMER_MODE_REPEATED 2
#define APP_TIMER_TICKS(ms) (ms)
#define APP_ERROR_CHECK(value) assert((value) == 0)
static settings_data_t *settings_get_data(void) { return &settings; }
static int nrf_drv_saadc_init(void *config, void (*callback)(nrf_drv_saadc_evt_t const *)) {
    (void)config; (void)callback; init_calls++; return init_result;
}
static int nrf_drv_saadc_channel_init(int channel, nrf_saadc_channel_config_t *config) {
    assert(channel == 0); channel_calls++; last_adc_input = config->input; return channel_result;
}

static void nrfx_saadc_channel_uninit(int channel) { assert(channel == 0); channel_uninit_calls++; }
static void nrf_drv_saadc_uninit(void) { uninit_calls++; }
static void nrf_gpio_cfg_input(int pin, int pull) { assert(pin == 3 && pull == 3); gpio_configs++; }
static int nrf_gpio_pin_read(int pin) { assert(pin == 3); gpio_reads++; return charge_pin; }
static int app_timer_create(int *timer, int mode, void (*cb)(void *)) { (void)timer; assert(mode == 2); timer_cb = cb; return 0; }
static int app_timer_start(int timer, int ticks, void *context) { (void)timer; (void)context; timer_period=ticks; return 0; }

typedef int nrfx_err_t;
#define NRF_SAADC_STATE_IDLE 0
#define NRF_SAADC_STATE_BUSY 1
#define NRFX_ERROR_BUSY 17
#define NRFX_SUCCESS 0
#define NRF_SAADC_INT_STARTED 1
#define NRF_SAADC_INT_END 2
#define NRF_SAADC_CHANNEL_COUNT 8
#define NRF_SAADC_INPUT_DISABLED 0
#define NRF_SAADC_TASK_START 1
#define NRF_SAADC_TASK_SAMPLE 2
#define NRF_SAADC_EVENT_STARTED 1
#define NRF_SAADC_EVENT_END 2
#define HW_TIMEOUT 10000
#define NRFX_LOG_WARNING(...) ((void)0)
#define NRFX_LOG_INFO(...) ((void)0)
#define NRFX_ASSERT(expr) ((void)0) /* Actual RELEASE build: NRF_ASSERT_PRESENT==0. */
#define NRFX_WAIT_FOR(test,tries,delay,result) do { (result)=(test); } while(0)
static struct {int adc_state,active_channels;bool low_power_mode;struct{int pselp,pseln;}psel[8];}m_cb={.active_channels=1};
static nrf_saadc_value_t *dma_target;
static bool adc_end,force_timeout;
static void nrf_saadc_int_disable(int x){(void)x;}
static void nrf_saadc_int_enable(int x){(void)x;}
static void nrf_saadc_buffer_init(nrf_saadc_value_t*p,int n){assert(n==1);dma_target=p;}
static void nrf_saadc_channel_input_set(int c,int p,int n){(void)c;(void)p;(void)n;}
static void nrf_saadc_task_trigger(int task){if(task==NRF_SAADC_TASK_SAMPLE&&!force_timeout){*dma_target=adc_sample;adc_end=true;}}
static bool nrf_saadc_event_check(int event){assert(event==NRF_SAADC_EVENT_END);return adc_end;}
static void nrf_saadc_event_clear(int event){if(event==NRF_SAADC_EVENT_END)adc_end=false;}
nrfx_err_t nrfx_saadc_sample_convert(uint8_t channel, nrf_saadc_value_t * p_value)
{
    nrfx_err_t err_code;

    if (m_cb.adc_state != NRF_SAADC_STATE_IDLE)
    {
        err_code = NRFX_ERROR_BUSY;
        NRFX_LOG_WARNING("Function: %s error code: %s.",
                         __func__,
                         NRFX_LOG_ERROR_STRING_GET(err_code));
        return err_code;
    }
    m_cb.adc_state = NRF_SAADC_STATE_BUSY;
    nrf_saadc_int_disable(NRF_SAADC_INT_STARTED | NRF_SAADC_INT_END);
    nrf_saadc_buffer_init(p_value, 1);
    if (m_cb.active_channels > 1)
    {
        for (uint32_t i = 0; i < NRF_SAADC_CHANNEL_COUNT; ++i)
        {
            nrf_saadc_channel_input_set(i, NRF_SAADC_INPUT_DISABLED, NRF_SAADC_INPUT_DISABLED);
        }
    }
    nrf_saadc_channel_input_set(channel, m_cb.psel[channel].pselp, m_cb.psel[channel].pseln);
    nrf_saadc_task_trigger(NRF_SAADC_TASK_START);
    nrf_saadc_task_trigger(NRF_SAADC_TASK_SAMPLE);

    bool result;
    NRFX_WAIT_FOR(nrf_saadc_event_check(NRF_SAADC_EVENT_END), HW_TIMEOUT, 0, result);
    NRFX_ASSERT(result);

    nrf_saadc_event_clear(NRF_SAADC_EVENT_STARTED);
    nrf_saadc_event_clear(NRF_SAADC_EVENT_END);

    NRFX_LOG_INFO("Conversion value: %d, channel %d.", *p_value, channel);

    if (m_cb.active_channels > 1)
    {
        for (uint32_t i = 0; i < NRF_SAADC_CHANNEL_COUNT; ++i)
        {
            nrf_saadc_channel_input_set(i, m_cb.psel[i].pselp, m_cb.psel[i].pseln);
        }
    }

    if (m_cb.low_power_mode)
    {
        nrf_saadc_int_enable(NRF_SAADC_INT_STARTED | NRF_SAADC_INT_END);
    }
    else
    {
        nrf_saadc_int_enable(NRF_SAADC_INT_END);
    }

    m_cb.adc_state = NRF_SAADC_STATE_IDLE;

    err_code = NRFX_SUCCESS;
    NRFX_LOG_WARNING("Function: %s, error code: %s.",
                     __func__,
                     NRFX_LOG_ERROR_STRING_GET(err_code));
    return err_code;
}
/* ACTUAL_BATTERY_INCLUDE */


int main(void){
 nrf_saadc_value_t value=123;force_timeout=false;
 assert(bat_read_adc(false,&value)&&value==768);
 puts("PASS completed SDK ADC conversion retains valid calibration input");
 const nrf_saadc_value_t stale[]={-32768,-1,0,1,512,768,1023,32767};
 for(unsigned i=0;i<sizeof(stale)/sizeof(stale[0]);i++){
  force_timeout=true;value=stale[i];assert(!bat_read_adc(false,&value)&&value==0);
 }
 puts("PASS SDK END timeout never accepts any of8 plausible/invalid old samples");
 for(unsigned mode=0;mode<2;mode++){
  settings.bat_mode=mode;force_timeout=false;adc_sample=768;bat_measure();
  assert(bat_has_reading()&&bat_get_voltage_mv()==(mode?3918:2700));
  force_timeout=true;bat_measure();assert(!bat_has_reading()&&!bat_is_low()&&!get_stats()&&bat_get_voltage_mv()==0);
  force_timeout=false;bat_measure();assert(bat_has_reading()&&bat_get_voltage_mv()==(mode?3918:2700));
  for(int sample=1;sample<=1023;sample++){
   adc_sample=sample;value=-1;assert(bat_read_adc(mode,&value)&&value==sample);
  }
 }
 puts("PASS both battery modes: actual bat_measure timeout/recovery and all2046 valid ADC values");
 adc_sample=0;assert(!bat_read_adc(false,&value));
 adc_sample=-1;assert(!bat_read_adc(false,&value));
 adc_sample=1024;assert(!bat_read_adc(false,&value));
 sample_result=0;
 puts("PASS existing invalid ADC sample boundaries preserved");
}
