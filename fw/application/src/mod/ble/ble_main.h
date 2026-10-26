/*
 * ble.h
 *
 *  Created on: 2021年9月28日
 *      Author: solos
 */

#ifndef BLE_H_
#define BLE_H_

//#define DEVICE_NAME "amiibolink" /**< Name of device. Will be included in the advertising data. */

#define MAX_MTU_DAT_SIZE (NRF_SDH_BLE_GATT_MAX_MTU_SIZE-3)

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef enum {
    BLE_DEVICE_MODE_PIXLJS,
    BLE_DEVICE_MODE_AMIIBOLINK,
    BLE_DEVICE_MODE_AMIIBOLINK_V2,
    BLE_DEVICE_MODE_AMILOOP
} ble_device_mode_t;

typedef enum {
    BLE_LINK_INACTIVE,
    BLE_LINK_ADVERTISING,
    BLE_LINK_CONNECTED,
    BLE_LINK_HOST_CONNECTED,
    BLE_LINK_DISCONNECTING
} ble_link_state_t;

typedef void (*ble_link_state_handler_t)(ble_link_state_t state);

typedef void (*nus_rx_data_handler_t)(const uint8_t *data, size_t data_len);
typedef void (*nus_tx_ready_handler_t)(void);


void ble_init(void);
/* Main loop only: dispatch queued NUS work and disconnect cleanup. */
void ble_process_pending(void);
void ble_device_mode_prepare(ble_device_mode_t mode);
void ble_adv_start(void);
void ble_disable();
bool ble_is_connected(void);
/* Foreground UI: callbacks run only from ble_process_pending(), never an IRQ.
 * Unregister before freeing the owning view. No packets trigger a callback
 * unless the connection/advertising state actually changed. */
ble_link_state_t ble_link_state_get(void);
void ble_link_state_observe(ble_link_state_handler_t handler);
/* Foreground only; resumes visibility without restarting services or an
 * established link. A concurrent connection is a harmless false result. */
bool ble_restart_advertising(void);


void ble_nus_set_handler(nus_rx_data_handler_t rx_data_handler, nus_tx_ready_handler_t tx_ready_handler);
uint32_t ble_nus_tx_data(void *data, size_t length);
size_t ble_nus_max_data_length(void);
/* Foreground-only diagnostic. requested_mtu=0 reads; 23/250 sets the
 * peripheral preference for the NEXT link. Never changes the current link,
 * disconnects, writes settings, or alters the configured SoftDevice maximum.
 * Snapshot: MTUD, version, flags, effective/next/max/value-capacity (u16 LE),
 * two reserved zero bytes. Setting requires an active Pixl.js session. */
#define BLE_MTU_DIAGNOSTIC_SIZE 16u
bool ble_mtu_diagnostic(uint16_t requested_mtu, uint8_t *snapshot, size_t capacity);
/* Fail a foreground file-transfer session without retaining a lost TX frame. */
void ble_nus_abort_transfer(void);
void ble_get_addr_str(char addr_fmt[]);



#endif /* BLE_H_ */
