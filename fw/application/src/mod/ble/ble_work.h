#ifndef BLE_WORK_H
#define BLE_WORK_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

/* One foreground consumer, IRQ producers. No filesystem work in IRQs. */
#define BLE_WORK_CAPACITY 4
#define BLE_WORK_DATA_SIZE 247
typedef void (*ble_work_rx_t)(const uint8_t *, size_t);
typedef void (*ble_work_notify_t)(void);

void ble_work_set_handlers(ble_work_rx_t rx, ble_work_notify_t tx);
void ble_work_connected(void);
void ble_work_disconnected(void);
bool ble_work_receive(const uint8_t *data, size_t length);
bool ble_work_tx_ready(void);
void ble_work_process(ble_work_notify_t cleanup);
bool ble_work_can_send(void);
/* True only after deferred cleanup has returned; never close VFS from IRQs. */
bool ble_work_cleanup_complete(void);

#endif
