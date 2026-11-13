#ifndef MUI_NAV_DIAG_H
#define MUI_NAV_DIAG_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define MUI_NAV_DIAG_SNAPSHOT_SIZE 104u
#define MUI_MENU_DIAG_SIZE 16u
#define MUI_MENU_DIAG_V2_SIZE 32u

/* The first desktop lifetime in this boot. Freeze the debounced button counts
 * when a selection begins or the desktop leaves without one. A new entry
 * never resets the record. Only the synchronous launcher call is timed. */
#if defined(PIXL_RUNTIME_DIAGNOSTICS) && defined(BOARD_LCD)
#define MUI_FIRST_MENU_DIAG
void mui_menu_diag_enter(void);
void mui_menu_diag_leave(void);
bool mui_menu_diag_select(uint8_t app_id);
void mui_menu_diag_return(bool selected_app_active);
bool mui_menu_diag_snapshot(uint8_t *out, size_t capacity);
/* PXMI v2 retains v1 fields and appends the most recent actual app return.
 * These hooks are foreground-only and never change navigation or persistence.
 * Zero app IDs/context mean no observed return or no icon covering the center. */
void mui_menu_return_diag_begin(uint8_t app_id, uint32_t context);
void mui_menu_return_diag_commit(bool desktop, uint8_t target, uint32_t context);
void mui_menu_return_diag_draw(uint32_t context, uint8_t label, uint8_t icon);
void mui_menu_return_diag_stale(uint32_t context);
bool mui_menu_diag_snapshot_v2(uint8_t *out, size_t capacity);
#else
static inline void mui_menu_diag_enter(void) {}
static inline void mui_menu_diag_leave(void) {}
static inline bool mui_menu_diag_select(uint8_t id) { (void)id; return false; }
static inline void mui_menu_diag_return(bool active) { (void)active; }
#endif

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
