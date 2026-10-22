#include "mui_nav_diag.h"
#include "app_util_platform.h"
#include <limits.h>
#include <string.h>

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
