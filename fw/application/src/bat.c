/* Battery indication: existing board calibration, filtered voltage and bar hysteresis. */
#include "bat.h"
#include "app_error.h"
#include "app_timer.h"
#include "boards.h"
#include "nrf_drv_saadc.h"
#include "nrf_gpio.h"
#include "settings.h"
#include <stddef.h>

#define ADC_CHANNEL 0
#define BAT_LEVEL_NUM 9
#define BAT_BAR_HYSTERESIS_MV 30
#define BAT_LOW_HYSTERESIS_MV 50

APP_TIMER_DEF(m_chrg_timer);

/* Same thresholds as before; these are deliberately not capacity percentages. */
static const uint16_t cr2032_voltage_map[] = {2900, 2800, 2700, 2600, 2500, 2400, 2300, 2100, 2000};
static const uint16_t lipo_voltage_map[] = {4100, 3980, 3920, 3870, 3800, 3700, 3600, 3500, 3400};

static chrg_data_t chrg;
static bool sample_valid;
static bool sample_lipo;
static bool mode_initialized;
static bool low_voltage;
static int32_t filtered_mv_q8;
static uint16_t voltage_mv;
static uint8_t charge_candidate;
static uint8_t charge_samples;

static void saadc_callback(nrf_drv_saadc_evt_t const *p_event) { (void)p_event; }

static bool bat_read_adc(bool lipo, nrf_saadc_value_t *value) {
    nrf_saadc_channel_config_t config = NRF_DRV_SAADC_DEFAULT_CHANNEL_CONFIG_SE(
        lipo ? NRF_SAADC_INPUT_AIN0 : NRF_SAADC_INPUT_VDD);
    /* An ADC already in use is not ours to uninitialize. Retry next second. */
    if (nrf_drv_saadc_init(NULL, saadc_callback) != NRF_SUCCESS) {
        return false;
    }
    if (nrf_drv_saadc_channel_init(ADC_CHANNEL, &config) != NRF_SUCCESS) {
        nrf_drv_saadc_uninit();
        return false;
    }
    /* SDK17.1 checks missing END only with a release-disabled ASSERT and can
     * return SUCCESS without DMA output. Zero is an invalid reading below,
     * so a timed-out conversion cannot reuse an old or indeterminate sample. */
    *value = 0;
    ret_code_t result = nrfx_saadc_sample_convert(ADC_CHANNEL, value);
    nrfx_saadc_channel_uninit(ADC_CHANNEL);
    nrf_drv_saadc_uninit();
    return result == NRF_SUCCESS && *value > 0 && *value <= 1023;
}

static void bat_update_voltage(uint16_t measured_mv, bool first) {
    const uint16_t *map = sample_lipo ? lipo_voltage_map : cr2032_voltage_map;
    if (first) {
        filtered_mv_q8 = (int32_t)measured_mv * 256;
    } else {
        /* One sample/second, EMA alpha=1/4. Fixed-point avoids rounding stalls. */
        filtered_mv_q8 += ((int32_t)measured_mv * 256 - filtered_mv_q8) / 4;
    }
    voltage_mv = (uint16_t)((filtered_mv_q8 + 128) / 256);
    chrg.voltage = voltage_mv / 1000.0f;
    if (first) {
        chrg.level = 0;
        for (uint8_t i = 0; i < BAT_LEVEL_NUM; i++) {
            if (voltage_mv >= map[i]) {
                chrg.level = BAT_LEVEL_NUM - i - 1;
                break;
            }
        }
        low_voltage = voltage_mv < map[6];
    } else {
        while (chrg.level < BAT_LEVEL_NUM - 1 &&
               voltage_mv >= map[BAT_LEVEL_NUM - chrg.level - 2] + BAT_BAR_HYSTERESIS_MV) {
            chrg.level++;
        }
        while (chrg.level > 0 && voltage_mv + BAT_BAR_HYSTERESIS_MV < map[BAT_LEVEL_NUM - chrg.level - 1]) {
            chrg.level--;
        }
        if (voltage_mv < map[6]) {
            low_voltage = true;
        } else if (voltage_mv >= map[6] + BAT_LOW_HYSTERESIS_MV) {
            low_voltage = false;
        }
    }
}

static void bat_measure(void) {
    bool lipo = settings_get_data()->bat_mode;
    bool changed_mode = !mode_initialized || lipo != sample_lipo;
    if (changed_mode) {
        sample_lipo = lipo;
        mode_initialized = true;
        sample_valid = false;
        charge_samples = 0;
        if (lipo) {
            nrf_gpio_cfg_input(CHRG_PIN, NRF_GPIO_PIN_PULLUP);
        }
    }

    /* CHRG is only meaningful on the existing LiPo hardware. */
    uint8_t charge = lipo ? (nrf_gpio_pin_read(CHRG_PIN) != 0) : 1;
    if (changed_mode) {
        chrg.stats = charge;
        charge_candidate = charge;
    } else if (charge != charge_candidate) {
        charge_candidate = charge;
        charge_samples = 1;
    } else if (charge_samples < 2) {
        charge_samples++;
        if (charge_samples == 2) {
            chrg.stats = charge_candidate;
        }
    }

    nrf_saadc_value_t adc_value = 0;
    if (!bat_read_adc(lipo, &adc_value)) {
        sample_valid = false;
        return;
    }
    /* Preserve the board's existing VDD / AIN0 divider calibration. */
    float millivolts = 3600.0f / 1024 * adc_value * (lipo ? 1.451f : 1.0f);
    bat_update_voltage((uint16_t)(millivolts + 0.5f), !sample_valid);
    sample_valid = true;
}

bool bat_has_reading(void) { return sample_valid && sample_lipo == !!settings_get_data()->bat_mode; }
uint16_t bat_get_voltage_mv(void) { return bat_has_reading() ? voltage_mv : 0; }
uint8_t bat_get_level(void) { return bat_has_reading() ? chrg.level : 0; }
bool get_stats(void) { return bat_has_reading() && sample_lipo && chrg.stats == 0; }
bool bat_is_low(void) { return bat_has_reading() && low_voltage && !get_stats(); }
void chrg_set_callback(chrg_data_cb_t cb) { chrg.callback = cb; }

static void chrg_read(void *p_context) {
    (void)p_context;
    uint8_t old_level = bat_get_level();
    uint16_t old_voltage = bat_get_voltage_mv() / 10;
    bool old_charging = get_stats();
    bool old_low = bat_is_low();
    bool old_valid = bat_has_reading();
    bat_measure();
    if (chrg.callback && (old_level != bat_get_level() || old_charging != get_stats() ||
                          old_low != bat_is_low() || old_valid != bat_has_reading() ||
                          old_voltage != bat_get_voltage_mv() / 10)) {
        chrg.callback();
    }
}

void chrg_init(void) {
    bat_measure();
    ret_code_t error = app_timer_create(&m_chrg_timer, APP_TIMER_MODE_REPEATED, chrg_read);
    APP_ERROR_CHECK(error);
    error = app_timer_start(m_chrg_timer, APP_TIMER_TICKS(1000), NULL);
    APP_ERROR_CHECK(error);
}
