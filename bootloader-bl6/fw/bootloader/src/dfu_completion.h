#ifndef PIXL_DFU_COMPLETION_H
#define PIXL_DFU_COMPLETION_H

#include <stdbool.h>

/* Terminal image validation/commit owns the settings until the next reset. */
extern volatile bool g_dfu_finalizing;
extern volatile bool g_dfu_final_success;

/* Arm the commit watchdog before settings calls that may complete inline. */
void nrf_dfu_completion_start(void);

/* True while the final successful Execute response still needs BLE delivery. */
bool nrf_dfu_ble_response_pending(void);

#endif
