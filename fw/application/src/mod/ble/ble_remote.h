#ifndef BLE_REMOTE_H
#define BLE_REMOTE_H
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
/* Permission is volatile and can only be changed by a local settings action. */
bool ble_remote_enabled(void);
bool ble_remote_set_enabled(bool enabled);
void ble_remote_shutdown(void);
/* IRQ-safe: only advances a counter. Never performs UI/BLE/filesystem work. */
void ble_remote_local_activity(void);
/* Main loop after mui_tick: at most one action, never queued in MUI. */
void ble_remote_poll(void);
void ble_remote_receive(const uint8_t *data, size_t length);
/* Internal queue tag captures the local-input epoch at IRQ receipt. */
bool ble_remote_receive_irq(const uint8_t *data, size_t length);
bool ble_remote_dispatching(void);
bool ble_remote_response_pending(void);
#endif
