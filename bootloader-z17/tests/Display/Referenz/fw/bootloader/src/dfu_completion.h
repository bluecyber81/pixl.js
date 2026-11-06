#ifndef PIXL_DFU_COMPLETION_H
#define PIXL_DFU_COMPLETION_H

#include <stdbool.h>

/* Terminal image validation/commit owns the settings until the next reset. */
extern volatile bool g_dfu_finalizing;
extern volatile bool g_dfu_final_success;

/* Arm the commit watchdog before admitting settings erase/write operations. */
void nrf_dfu_completion_start(void);

/* Main context, with fstorage idle: verify the final commit, then reply once. */
void nrf_dfu_completion_process(bool timed_out);

/* True while accepted or queued responses still need BLE delivery. */
bool nrf_dfu_ble_response_pending(void);

#endif
