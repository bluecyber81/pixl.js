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
typedef struct { bool bat_mode; } settings_data_t;
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
static int nrfx_saadc_sample_convert(int channel, nrf_saadc_value_t *out) {
    assert(channel == 0); sample_calls++; *out = adc_sample; return sample_result;
}
static void nrfx_saadc_channel_uninit(int channel) { assert(channel == 0); channel_uninit_calls++; }
static void nrf_drv_saadc_uninit(void) { uninit_calls++; }
static void nrf_gpio_cfg_input(int pin, int pull) { assert(pin == 3 && pull == 3); gpio_configs++; }
static int nrf_gpio_pin_read(int pin) { assert(pin == 3); gpio_reads++; return charge_pin; }
static int app_timer_create(int *timer, int mode, void (*cb)(void *)) { (void)timer; assert(mode == 2); timer_cb = cb; return 0; }
static int app_timer_start(int timer, int ticks, void *context) { (void)timer; (void)context; timer_period=ticks; return 0; }
/* ACTUAL_BATTERY_INCLUDE */
static void changed(void) { callbacks++; }
static void reset(bool lipo) {
    memset(&chrg, 0, sizeof(chrg));
    sample_valid = sample_lipo = mode_initialized = low_voltage = false;
    filtered_mv_q8 = voltage_mv = charge_candidate = charge_samples = 0;
    init_result = channel_result = sample_result = 0;
    init_calls = channel_calls = sample_calls = uninit_calls = channel_uninit_calls = 0;
    gpio_reads = gpio_configs = callbacks = 0;
    settings.bat_mode = lipo; charge_pin = 1; adc_sample = 768;
    chrg_set_callback(changed);
}
static void settle(uint16_t mv, int count) { for (int i=0;i<count;i++) bat_update_voltage(mv,false); }
static void test_measurement_modes(void) {
    reset(false); chrg_init();
    assert(timer_period == 1000 && timer_cb == chrg_read);
    assert(bat_has_reading() && bat_get_voltage_mv() == 2700 && bat_get_level() == 6);
    assert(gpio_configs == 0 && gpio_reads == 0 && last_adc_input == NRF_SAADC_INPUT_VDD);
    assert(!get_stats() && !bat_is_low());
    settings.bat_mode=true;
    assert(!bat_has_reading() && bat_get_voltage_mv()==0); /* Never mix modes. */
    chrg_read(NULL);
    assert(last_adc_input==NRF_SAADC_INPUT_AIN0 && gpio_configs==1 && gpio_reads==1);
    assert(bat_get_voltage_mv()==3918 && bat_get_level()==5 && callbacks==1);
    settings.bat_mode=false; chrg_read(NULL);
    assert(bat_get_voltage_mv()==2700 && gpio_reads==1 && !get_stats());
    puts("PASS battery cold start, 1-second timer and mode reset/calibration");
}
static void test_filter_thresholds(void) {
    for (int mode=0;mode<2;mode++) {
        reset(mode); sample_lipo=mode;
        const uint16_t *map=mode?lipo_voltage_map:cr2032_voltage_map;
        for(int i=0;i<8;i++) {
            bat_update_voltage(map[i],true); assert(chrg.level==8-i);
            for(int j=0;j<200;j++) bat_update_voltage(map[i]+(j%2?10:-10),false);
            assert(chrg.level==8-i); /* Noise near a threshold does not chatter. */
            settle(map[i]-31,100); assert(chrg.level==7-i);
            settle(map[i]+29,100); assert(chrg.level==7-i);
            settle(map[i]+31,100); assert(chrg.level==8-i);
        }
        bat_update_voltage(map[6]-1,true); assert(low_voltage);
        settle(map[6]+49,100); assert(low_voltage);
        settle(map[6]+50,100); assert(!low_voltage);
        settle(map[6],100); assert(!low_voltage);
        settle(map[6]-1,100); assert(low_voltage);
        bat_update_voltage(0,true); assert(chrg.level==0);
        bat_update_voltage(65535,true); assert(chrg.level==8 && voltage_mv==65535);
    }
    reset(false); sample_lipo=false;
    bat_update_voltage(3000,true); bat_update_voltage(2000,false);
    assert(voltage_mv==2750); /* EMA alpha=1/4, no step directly to the dip. */
    settle(2000,100); assert(voltage_mv==2000);
    puts("PASS all bar thresholds +/- hysteresis, low warning and EMA boundaries");
}
static void test_adc_failures(void) {
    reset(false); bat_measure(); assert(bat_has_reading());
    init_result=1; chrg_read(NULL);
    assert(!bat_has_reading() && bat_get_voltage_mv()==0 && bat_get_level()==0);
    assert(uninit_calls==1 && channel_uninit_calls==1 && callbacks==1); /* Do not uninit another owner. */
    init_result=0; channel_result=1; chrg_read(NULL);
    assert(!bat_has_reading() && uninit_calls==2 && channel_uninit_calls==1);
    channel_result=0; sample_result=1; chrg_read(NULL);
    assert(!bat_has_reading() && uninit_calls==3 && channel_uninit_calls==2);
    sample_result=0;
    int invalid[] = {-32768,-1,0,1024,32767};
    for(size_t i=0;i<sizeof(invalid)/sizeof(*invalid);i++) {
        adc_sample=invalid[i]; chrg_read(NULL); assert(!bat_has_reading());
    }
    adc_sample=768; chrg_read(NULL);
    assert(bat_has_reading() && bat_get_voltage_mv()==2700 && callbacks==2);
    for(int mode=0;mode<2;mode++) {
        reset(mode);
        for(int count=1;count<=1023;count++) {
            adc_sample=count; bat_measure();
            assert(bat_has_reading() && bat_get_level()<=8 && bat_get_voltage_mv()<=5220);
        }
    }
    puts("PASS ADC failures, ownership cleanup, recovery and all 2046 valid ADC inputs");
}
static void test_charging_and_callbacks(void) {
    reset(true); adc_sample=680; bat_measure();
    assert(bat_is_low() && !get_stats());
    charge_pin=0; chrg_read(NULL); assert(!get_stats());
    charge_pin=1; chrg_read(NULL); assert(!get_stats());
    charge_pin=0; chrg_read(NULL); assert(!get_stats());
    chrg_read(NULL); assert(get_stats() && !bat_is_low());
    assert(callbacks==1);
    charge_pin=1; chrg_read(NULL); assert(get_stats());
    chrg_read(NULL); assert(!get_stats() && bat_is_low() && callbacks==2);
    chrg_set_callback(NULL); charge_pin=0; chrg_read(NULL); chrg_read(NULL); assert(callbacks==2);
    puts("PASS debounced charging pin, low suppression and callback cleanup");
}
int main(void) {
    test_measurement_modes(); test_filter_thresholds(); test_adc_failures(); test_charging_and_callbacks();
    return 0;
}
