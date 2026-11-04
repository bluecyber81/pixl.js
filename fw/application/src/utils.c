/*
 * utils.c
 *
 *  Created on: 2021年10月10日
 *      Author: solos
 */

#include "nrf52.h"
#include "nrf_log.h"
#include "nrf_bootloader_info.h"
#include "nrf_nvic.h"
#include "nrf_pwr_mgmt.h"
#include "nrf_sdh.h"
#include "nrf_soc.h"
#include "string.h"
#include "utils2.h"
#include "mini_app_launcher.h"

ret_code_t utils_rand_bytes(uint8_t rand[], uint8_t bytes) {
    ret_code_t err;
    while ((err = sd_rand_application_vector_get(rand, bytes)) == NRF_ERROR_SOC_RAND_NOT_ENOUGH_VALUES) {
    };
    return err;
}

void utils_get_device_id(uint8_t *p_device_id) {
    uint32_t device_id0 = NRF_FICR->DEVICEID[0];
    uint32_t device_id1 = NRF_FICR->DEVICEID[1];
    memcpy(p_device_id, &device_id0, sizeof(device_id0));
    memcpy(p_device_id + sizeof(device_id0), &device_id1, sizeof(device_id1));
}

void int32_to_bytes_le(uint32_t val, uint8_t *data) {
    data[0] = val >> 24;
    data[1] = val >> 16;
    data[2] = val >> 8;
    data[3] = val >> 0;
}

bool system_prepare_reset(void) {
    return mini_app_launcher_prepare_exit(mini_app_launcher(), MINI_APP_EXIT_RESET);
}

bool system_reset_prepared(void) {
    return mini_app_launcher_exit_prepared(mini_app_launcher(), MINI_APP_EXIT_RESET);
}

void system_cancel_reset(void) {
    mini_app_launcher_t *launcher = mini_app_launcher();
    if (launcher->exit_prepared && launcher->exit_reason == MINI_APP_EXIT_RESET)
        mini_app_launcher_cancel_exit(launcher);
}

bool enter_dfu(void) {
    /* No flag mutation, transport teardown or reset before the app is saved. */
    if (!system_prepare_reset()) return false;
    /* CLR takes a bit mask: zero clears nothing. Preserve unrelated bits 1/2. */
    ret_code_t err = sd_power_gpregret_clr(0, BOOTLOADER_DFU_START_MASK);
    if (err != NRF_SUCCESS) {
        NRF_LOG_ERROR("DFU flag clear failed: %u", (unsigned)err);
        system_cancel_reset();
        return false;
    }
    err = sd_power_gpregret_set(0, BOOTLOADER_DFU_START);
    if (err != NRF_SUCCESS) {
        NRF_LOG_ERROR("DFU flag set failed: %u", (unsigned)err);
        system_cancel_reset();
        return false;
    }
    /* Reset itself stops BLE. Keep the live transport intact on preparation
     * or SVC failure, and disarm the magic if a mocked/failed reset returns. */
    err = sd_nvic_SystemReset();
    NRF_LOG_ERROR("DFU reset unexpectedly returned: %u", (unsigned)err);
    err = sd_power_gpregret_clr(0, BOOTLOADER_DFU_START_MASK);
    if (err != NRF_SUCCESS) NRF_LOG_ERROR("DFU cleanup failed: %u", (unsigned)err);
    system_cancel_reset();
    return false;
}

bool system_reboot(void) {
    if (!system_prepare_reset()) return false;
    ret_code_t err = sd_nvic_SystemReset();
    NRF_LOG_ERROR("Reset unexpectedly returned: %u", (unsigned)err);
    system_cancel_reset();
    return false;
}

void go_sleep() { nrf_pwr_mgmt_shutdown(NRF_PWR_MGMT_SHUTDOWN_GOTO_SYSOFF); }
