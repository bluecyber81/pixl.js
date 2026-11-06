#ifndef PIXL_DFU_COMPLETION_H
#define PIXL_DFU_COMPLETION_H

#include <stdbool.h>
#include "nrf_dfu_req_handler.h"

/* Terminal image validation/commit owns the settings until the next reset. */
extern volatile bool g_dfu_finalizing;
extern volatile bool g_dfu_final_success;
/* Abort/inactivity closes request admission while the main loop drains flash. */
extern volatile bool g_dfu_reset_pending;

/* Main-context-only UI notification: false before validation, true before
 * settings persistence. This is progress, never a commit-success signal. */
void dfu_display_final_phase(bool saving);

/* Arm the commit watchdog before admitting settings erase/write operations. */
void nrf_dfu_completion_start(void);

/* Main context, with fstorage idle: verify the final commit, then reply once. */
void nrf_dfu_completion_process(bool timed_out);

/* True while accepted or queued responses still need BLE delivery. */
bool nrf_dfu_ble_response_pending(void);

/* True for live BLE requests and transports with their own context model. */
bool nrf_dfu_ble_request_current(nrf_dfu_request_t const * p_req);

/* Main loop only: finish the old session before starting advertising again. */
void nrf_dfu_ble_disconnect_process(void);
void nrf_dfu_request_session_restore(void);

#endif
