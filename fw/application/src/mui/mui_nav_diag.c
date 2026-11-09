#include "mui_nav_diag.h"
#include "app_util_platform.h"
#include <limits.h>
#include <string.h>
#ifdef MUI_FIRST_MENU_DIAG
#include "app_timer.h"
enum {
    MENU_ENTERED = 1u, MENU_SELECTED = 2u, MENU_RETURNED = 4u,
    MENU_TARGET_ACTIVE = 8u, MENU_LEFT = 16u, MENU_SATURATED = 32u
};
static struct {
    uint32_t launch_time; /* start tick until MENU_RETURNED, then elapsed ms */
    uint8_t flags, app_id, center[3];
} first_menu;

static bool menu_waiting_for_selection(void) {
    return (first_menu.flags & (MENU_ENTERED | MENU_SELECTED | MENU_LEFT)) == MENU_ENTERED;
}
void mui_menu_diag_enter(void) {
    uint8_t nested;
    app_util_critical_region_enter(&nested);
    first_menu.flags |= MENU_ENTERED;
    app_util_critical_region_exit(nested);
}
void mui_menu_diag_leave(void) {
    uint8_t nested;
    app_util_critical_region_enter(&nested);
    if (menu_waiting_for_selection()) first_menu.flags |= MENU_LEFT;
    app_util_critical_region_exit(nested);
}
bool mui_menu_diag_select(uint8_t app_id) {
    uint8_t nested;
    app_util_critical_region_enter(&nested);
    bool first = menu_waiting_for_selection();
    if (first) {
        first_menu.app_id = app_id;
        first_menu.flags |= MENU_SELECTED;
        first_menu.launch_time = app_timer_cnt_get();
    }
    app_util_critical_region_exit(nested);
    return first;
}
void mui_menu_diag_return(bool selected_app_active) {
    /* Foreground only, after selection froze all IRQ counters. The elapsed
     * duration uses the 24-bit RTC modulo interval (1024 s on this board).
     * User idle time before selection is deliberately outside this interval. */
    if ((first_menu.flags & (MENU_SELECTED | MENU_RETURNED)) != MENU_SELECTED) return;
    uint32_t ticks = app_timer_cnt_diff_compute(app_timer_cnt_get(), first_menu.launch_time);
    uint64_t ms = (uint64_t)ticks * 1000u * (APP_TIMER_CONFIG_RTC_FREQUENCY + 1u) / APP_TIMER_CLOCK_FREQ;
    uint8_t nested;
    app_util_critical_region_enter(&nested);
    first_menu.launch_time = ms > UINT32_MAX ? UINT32_MAX : (uint32_t)ms;
    first_menu.flags |= MENU_RETURNED | (selected_app_active ? MENU_TARGET_ACTIVE : 0);
    app_util_critical_region_exit(nested);
}
#endif

typedef struct {
    uint32_t selection;
    int32_t save_result;
    uint16_t count;
    uint16_t focus;
    uint8_t stage;
} nav_attempt_t;

typedef struct {
    uint16_t raw[3][5];
    uint16_t posted[5];
    uint16_t dropped[5];
    uint16_t delivered[5];
    nav_attempt_t attempt[2];
    uint16_t sessions;
    uint8_t active;
    uint8_t highwater;
} nav_state_t;

/* One fixed object; no timers, pointers, allocations or persistence. */
static nav_state_t state;
_Static_assert(sizeof(state) == 96, "Navigation diagnostic RAM budget changed");

static void increment(uint16_t *value) {
    if (*value != UINT16_MAX) ++*value;
}

static nav_attempt_t *attempt_for(uint8_t type) {
    return type == 2 ? &state.attempt[0] : type == 3 ? &state.attempt[1] : NULL;
}

void mui_nav_diag_begin(void) {
    uint8_t nested;
    app_util_critical_region_enter(&nested);
    uint16_t sessions = state.sessions;
    increment(&sessions);
    memset(&state, 0, sizeof(state));
    state.sessions = sessions;
    state.active = 1;
    state.attempt[0].save_result = INT32_MIN;
    state.attempt[1].save_result = INT32_MIN;
    app_util_critical_region_exit(nested);
}

void mui_nav_diag_end(void) {
    uint8_t nested;
    app_util_critical_region_enter(&nested);
    state.active = 0;
    app_util_critical_region_exit(nested);
}

void mui_nav_diag_raw(uint8_t key, uint8_t type) {
    if (key >= 3 || type >= 5) return;
    uint8_t nested;
    app_util_critical_region_enter(&nested);
#ifdef MUI_FIRST_MENU_DIAG
    if (key == 1 && type < 3 && menu_waiting_for_selection()) {
        if (first_menu.center[type] == UINT8_MAX) first_menu.flags |= MENU_SATURATED;
        else ++first_menu.center[type];
    }
#endif
    if (state.active) increment(&state.raw[key][type]);
    app_util_critical_region_exit(nested);
}

void mui_nav_diag_post(uint8_t key, uint8_t type, bool accepted, uint8_t queue_depth) {
    if (key != 1 || type >= 5) return;
    uint8_t nested;
    app_util_critical_region_enter(&nested);
    if (state.active) {
        increment(accepted ? &state.posted[type] : &state.dropped[type]);
        if (queue_depth > state.highwater) state.highwater = queue_depth;
    }
    app_util_critical_region_exit(nested);
}

void mui_nav_diag_deliver(uint8_t key, uint8_t type) {
    if (key != 1 || type >= 5) return;
    uint8_t nested;
    app_util_critical_region_enter(&nested);
    if (state.active) increment(&state.delivered[type]);
    app_util_critical_region_exit(nested);
}

void mui_nav_diag_list(uint8_t type, uint32_t selection, uint16_t focus) {
    uint8_t nested;
    app_util_critical_region_enter(&nested);
    nav_attempt_t *attempt = attempt_for(type);
    if (state.active && attempt) {
        increment(&attempt->count);
        attempt->selection = selection;
        attempt->focus = focus;
        attempt->save_result = INT32_MIN;
        attempt->stage = 1;
    }
    app_util_critical_region_exit(nested);
}

void mui_nav_diag_settings(uint8_t type, uint32_t selection) {
    uint8_t nested;
    app_util_critical_region_enter(&nested);
    nav_attempt_t *attempt = attempt_for(type);
    if (state.active && attempt) {
        attempt->selection = selection;
        attempt->stage = 2;
    }
    app_util_critical_region_exit(nested);
}

void mui_nav_diag_save_begin(uint8_t type) {
    uint8_t nested;
    app_util_critical_region_enter(&nested);
    nav_attempt_t *attempt = attempt_for(type);
    if (state.active && attempt) {
        attempt->save_result = INT32_MIN;
        attempt->stage = 3;
    }
    app_util_critical_region_exit(nested);
}

void mui_nav_diag_save_result(uint8_t type, int32_t result) {
    uint8_t nested;
    app_util_critical_region_enter(&nested);
    nav_attempt_t *attempt = attempt_for(type);
    if (state.active && attempt) {
        attempt->save_result = result;
        attempt->stage = result == 0 ? 4 : 5;
    }
    app_util_critical_region_exit(nested);
}

void mui_nav_diag_exit_returned(uint8_t type) {
    uint8_t nested;
    app_util_critical_region_enter(&nested);
    nav_attempt_t *attempt = attempt_for(type);
    /* The Settings kill callback already ended the session; retain that final
     * observation without reactivating capture in the Desktop/BLE application. */
    if (attempt && attempt->stage == 4 && attempt->save_result == 0) attempt->stage = 6;
    app_util_critical_region_exit(nested);
}

static void write16(uint8_t *out, uint16_t value) {
    out[0] = (uint8_t)value;
    out[1] = (uint8_t)(value >> 8);
}

static void write32(uint8_t *out, uint32_t value) {
    for (unsigned i = 0; i < 4; ++i) out[i] = (uint8_t)(value >> (8 * i));
}

#ifdef MUI_FIRST_MENU_DIAG
bool mui_menu_diag_snapshot(uint8_t *out, size_t capacity) {
    if (!out || capacity < MUI_MENU_DIAG_SIZE) return false;
    uint8_t nested;
    app_util_critical_region_enter(&nested);
    memcpy(out, "PXMI", 4);
    out[4] = 1;
    out[5] = MUI_MENU_DIAG_SIZE;
    out[6] = first_menu.flags;
    out[7] = first_menu.app_id;
    memcpy(out + 8, first_menu.center, 3);
    out[11] = 0;
    write32(out + 12, (first_menu.flags & MENU_RETURNED) ? first_menu.launch_time : 0);
    app_util_critical_region_exit(nested);
    return true;
}
#endif

bool mui_nav_diag_snapshot(uint8_t *out, size_t capacity) {
    if (!out || capacity < MUI_NAV_DIAG_SNAPSHOT_SIZE) return false;
    uint8_t nested;
    app_util_critical_region_enter(&nested);
    memset(out, 0, MUI_NAV_DIAG_SNAPSHOT_SIZE);
    memcpy(out, "UIDG", 4);
    out[4] = 1;
    out[5] = state.active;
    write16(out + 6, state.sessions);
    for (unsigned key = 0; key < 3; ++key)
        for (unsigned type = 0; type < 5; ++type)
            write16(out + 8 + 2 * (key * 5 + type), state.raw[key][type]);
    for (unsigned type = 0; type < 5; ++type) {
        write16(out + 38 + 2 * type, state.posted[type]);
        write16(out + 48 + 2 * type, state.dropped[type]);
        write16(out + 58 + 2 * type, state.delivered[type]);
    }
    out[68] = state.highwater;
    for (unsigned i = 0; i < 2; ++i) {
        const nav_attempt_t *attempt = &state.attempt[i];
        uint8_t *wire = out + 72 + 16 * i;
        write32(wire, attempt->selection);
        write32(wire + 4, (uint32_t)(attempt->stage ? attempt->save_result : INT32_MIN));
        write16(wire + 8, attempt->count);
        write16(wire + 10, attempt->focus);
        wire[12] = attempt->stage;
    }
    app_util_critical_region_exit(nested);
    return true;
}
