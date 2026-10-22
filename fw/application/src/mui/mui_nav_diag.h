#ifndef MUI_NAV_DIAG_H
#define MUI_NAV_DIAG_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define MUI_NAV_DIAG_SNAPSHOT_SIZE 104u

/* RAM-only Settings navigation observation. Keys are LEFT/CENTER/RIGHT (0..2);
 * event types are PRESS/RELEASE/SHORT/LONG/REPEAT (0..4), matching MUI/BSP.
 * A new Settings main scene replaces the previous session, except its number.
 * End retains observations so they can be read later in the BLE application. */
void mui_nav_diag_begin(void);
void mui_nav_diag_end(void);
void mui_nav_diag_raw(uint8_t key, uint8_t type);
void mui_nav_diag_post(uint8_t key, uint8_t type, bool accepted, uint8_t queue_depth);
void mui_nav_diag_deliver(uint8_t key, uint8_t type);
void mui_nav_diag_list(uint8_t type, uint32_t selection, uint16_t focus);
void mui_nav_diag_settings(uint8_t type, uint32_t selection);
void mui_nav_diag_save_begin(uint8_t type);
void mui_nav_diag_save_result(uint8_t type, int32_t result);
void mui_nav_diag_exit_returned(uint8_t type);

/* UIDG v1, explicit little-endian, including zeroed reserved bytes.
 * Returns false without touching output when NULL or shorter than 104 bytes.
 * This function only reads the diagnostic state; it never resets it. */
bool mui_nav_diag_snapshot(uint8_t *out, size_t capacity);

#endif
