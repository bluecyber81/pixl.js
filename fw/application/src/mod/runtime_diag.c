#include "runtime_diag.h"
#if defined(PIXL_RUNTIME_DIAGNOSTICS)
#include "app_util_platform.h"
#include "mui_mem.h"
#include <string.h>

#if (defined(__arm__) || defined(__thumb__)) && defined(NRF52832)
#include "nrf.h"
extern uint32_t __StackLimit, __StackTop;
/* Zero until the first successful paint. Thereafter only moves towards the
 * stack limit, including when an earlier overwritten word matches again. */
static uintptr_t stack_watermark_end;

static uint32_t stack_mark(uintptr_t address) {
    return UINT32_C(0x6d91c32b) ^ (uint32_t)address;
}

static bool application_msp_valid(uintptr_t sp) {
    return (__get_CONTROL() & 2u) == 0 && __get_IPSR() == 0 &&
           sp >= (uintptr_t)&__StackLimit && sp <= (uintptr_t)&__StackTop &&
           (sp & 3u) == 0;
}

void runtime_diag_stack_init(void) {
    const uintptr_t sp = __get_MSP();
    if (stack_watermark_end || !application_msp_valid(sp)) return;
    /* First action in main, before enabling peripherals or S112. Paint only
     * below this frame, never another word after normal execution starts.
     * A preempting handler returns before this loop can write again. */
    for (uintptr_t p = (uintptr_t)&__StackLimit; p < sp; p += sizeof(uint32_t))
        *(volatile uint32_t *)p = stack_mark(p);
    stack_watermark_end = sp;
}

static uint32_t stack_min_free(void) {
    const uintptr_t sp = __get_MSP();
    if (!stack_watermark_end || !application_msp_valid(sp)) return UINT32_MAX;
    const uintptr_t limit = (uintptr_t)&__StackLimit;
    const uintptr_t end = sp < stack_watermark_end ? sp : stack_watermark_end;
    uintptr_t p = limit;
    while (p < end && *(volatile const uint32_t *)p == stack_mark(p)) p += sizeof(uint32_t);
    stack_watermark_end = p;
    return (uint32_t)(p - limit);
}
#else
void runtime_diag_stack_init(void) {}
#endif

typedef struct {
    uint16_t disconnects, overflows, timeouts, allocation_failures;
    uint8_t cause, hci_reason, vfs_command;
    int32_t vfs_error;
    uint32_t free, minimum_free, largest, minimum_largest, total;
    uint32_t allocated, maximum_allocated, samples, vfs_errors;
} runtime_diag_state_t;
static runtime_diag_state_t state;
_Static_assert(sizeof(state) <= 56, "runtime diagnostic RAM budget");
/* Volatile observations, not retained reset history or a USB/VBUS detector.
 * The bootloader may already have cleared RESETREAS bits before main(). */
static struct {
    uint32_t reset_reason;
    uint16_t voltage_mv, sleep_seconds;
    uint8_t flags;
} power_state;
_Static_assert(sizeof(power_state) <= 12, "power diagnostic RAM budget");
static struct {
    uint32_t elapsed_ms[STARTUP_PHASE_COUNT];
    uint8_t phases;
} startup_state;
_Static_assert(sizeof(startup_state) <= 28, "startup diagnostic RAM budget");

void runtime_diag_startup_mark(unsigned phase, uint32_t elapsed_ms) {
    if (phase >= STARTUP_PHASE_COUNT) return;
    CRITICAL_REGION_ENTER();
    /* Capture each phase once, in order, and reject an elapsed-time regression.
     * The caller must finish within its RTC counter span; this cannot detect
     * an entire counter revolution between two observations. */
    if (startup_state.phases == (uint8_t)((1u << phase) - 1u) &&
        (phase ? elapsed_ms >= startup_state.elapsed_ms[phase - 1u] : elapsed_ms == 0)) {
        startup_state.elapsed_ms[phase] = elapsed_ms;
        startup_state.phases |= (uint8_t)(1u << phase);
    }
    CRITICAL_REGION_EXIT();
}

void runtime_diag_boot_capture(uint32_t reset_reason) {
    /* Once, at main entry before the application's reset-reason clear. */
    if (!(power_state.flags & 1u)) {
        power_state.reset_reason = reset_reason;
        power_state.flags |= 1u;
    }
}

void runtime_diag_power_sample(uint16_t voltage_mv, bool valid, bool lipo, bool charging, uint16_t sleep_seconds) {
    CRITICAL_REGION_ENTER();
    power_state.voltage_mv = valid ? voltage_mv : 0;
    power_state.sleep_seconds = sleep_seconds;
    power_state.flags = (power_state.flags & 1u) | 2u | (valid ? 4u : 0u) |
                        (lipo ? 8u : 0u) | (valid && lipo && charging ? 16u : 0u);
    CRITICAL_REGION_EXIT();
}

static void increment16(uint16_t *value) { if (*value != UINT16_MAX) ++*value; }
static void increment32(uint32_t *value) { if (*value != UINT32_MAX) ++*value; }

void runtime_diag_ble_abort(uint8_t cause) {
    if (cause < RUNTIME_DIAG_QUEUE_OVERFLOW || cause > RUNTIME_DIAG_GATT_SERVER_TIMEOUT) return;
    CRITICAL_REGION_ENTER();
    state.cause = cause;
    if (cause == RUNTIME_DIAG_QUEUE_OVERFLOW) increment16(&state.overflows);
    if (cause == RUNTIME_DIAG_FRAGMENT_TIMEOUT || cause == RUNTIME_DIAG_GATT_CLIENT_TIMEOUT ||
        cause == RUNTIME_DIAG_GATT_SERVER_TIMEOUT) increment16(&state.timeouts);
    CRITICAL_REGION_EXIT();
}
void runtime_diag_ble_disconnected(uint8_t hci_reason) {
    CRITICAL_REGION_ENTER();
    state.hci_reason = hci_reason;
    increment16(&state.disconnects);
    CRITICAL_REGION_EXIT();
}
void runtime_diag_vfs_error(uint8_t command, int32_t error) {
    if (error >= 0) return;
    CRITICAL_REGION_ENTER();
    state.vfs_command = command;
    state.vfs_error = error;
    increment32(&state.vfs_errors);
    CRITICAL_REGION_EXIT();
}

/* TLSF block payload sizes, not requested sizes or whole-system RAM usage.
 * This is O(1); walking every allocation would make the UI slower. */
void runtime_diag_heap_change(size_t old_size, size_t new_size, bool failed) {
    CRITICAL_REGION_ENTER();
    if (failed) increment16(&state.allocation_failures);
    if (old_size <= state.allocated && new_size <= UINT32_MAX - (state.allocated - old_size)) {
        state.allocated = state.allocated - (uint32_t)old_size + (uint32_t)new_size;
        if (state.allocated > state.maximum_allocated) state.maximum_allocated = state.allocated;
    }
    CRITICAL_REGION_EXIT();
}
void runtime_diag_heap_reset(void) {
    CRITICAL_REGION_ENTER();
    state.allocated = 0;
    CRITICAL_REGION_EXIT();
}
void runtime_diag_heap_sample(uint32_t total, uint32_t free, uint32_t largest) {
    if (total == 0 || free > total || largest > free) return;
    CRITICAL_REGION_ENTER();
    if (state.samples == 0 || free < state.minimum_free) state.minimum_free = free;
    if (state.samples == 0 || largest < state.minimum_largest) state.minimum_largest = largest;
    state.total = total;
    state.free = free;
    state.largest = largest;
    increment32(&state.samples);
    CRITICAL_REGION_EXIT();
}
static void put16(uint8_t *out, uint16_t value) {
    out[0] = (uint8_t)value; out[1] = (uint8_t)(value >> 8);
}
static void put32(uint8_t *out, uint32_t value) {
    for (unsigned i = 0; i < 4; ++i) out[i] = (uint8_t)(value >> (8 * i));
}
bool runtime_diag_startup_snapshot(uint8_t *out, size_t capacity) {
    if (!out || capacity < STARTUP_DIAG_SIZE) return false;
    memset(out, 0, STARTUP_DIAG_SIZE);
    memcpy(out, "PXST", 4);
    out[4] = 1;
    out[5] = STARTUP_DIAG_SIZE;
    CRITICAL_REGION_ENTER();
    out[6] = startup_state.phases;
    /* Byte 7 is reserved; unset values are zero, qualified by the mask. */
    for (unsigned phase = 0; phase < STARTUP_PHASE_COUNT; ++phase)
        put32(out + 8 + 4 * phase, startup_state.elapsed_ms[phase]);
    CRITICAL_REGION_EXIT();
    return true;
}
bool runtime_diag_power_snapshot(uint8_t *out, size_t capacity) {
    if (!out || capacity < POWER_DIAG_SIZE) return false;
    memset(out, 0, POWER_DIAG_SIZE);
    memcpy(out, "PXPD", 4);
    out[4] = 1;
    out[5] = POWER_DIAG_SIZE;
    CRITICAL_REGION_ENTER();
    out[6] = power_state.flags;
    put32(out + 8, power_state.reset_reason);
    put16(out + 12, power_state.voltage_mv);
    put16(out + 14, power_state.sleep_seconds);
    CRITICAL_REGION_EXIT();
    return true;
}
bool runtime_diag_snapshot(uint8_t *out, size_t capacity) {
    if (out == NULL || capacity < RUNTIME_DIAG_SIZE) return false;
    /* Foreground-only query. Monitoring samples the pool without allocation. */
    mui_mem_monitor_t memory;
    mui_mem_monitor(&memory);
    runtime_diag_state_t saved;
    CRITICAL_REGION_ENTER();
    saved = state;
    CRITICAL_REGION_EXIT();
    memset(out, 0, RUNTIME_DIAG_SIZE);
    memcpy(out, "PXDG", 4);
    out[4] = 1;
    out[5] = RUNTIME_DIAG_SIZE;
    out[6] = (memory.total_size ? 1u : 0u) | (saved.samples ? 2u : 0u) |
             (saved.disconnects ? 32u : 0u) | (saved.vfs_errors ? 64u : 0u);
    out[7] = saved.cause;
    out[8] = saved.hci_reason;
    out[9] = saved.vfs_command;
    put16(out + 12, saved.disconnects);
    put16(out + 14, saved.overflows);
    put16(out + 16, saved.timeouts);
    put16(out + 18, saved.allocation_failures);
    put32(out + 20, (uint32_t)saved.vfs_error);
    put32(out + 24, memory.free_size);
    put32(out + 28, saved.samples ? saved.minimum_free : UINT32_MAX);
    put32(out + 32, memory.free_biggest_size);
    put32(out + 36, saved.samples ? saved.minimum_largest : UINT32_MAX);
    put32(out + 40, memory.total_size);
    put32(out + 44, saved.maximum_allocated);
    put32(out + 48, UINT32_MAX);
#if defined(__arm__) || defined(__thumb__)
    extern uint32_t __StackLimit, __StackTop;
    uintptr_t low = (uintptr_t)&__StackLimit, high = (uintptr_t)&__StackTop;
    if (high > low && high - low <= UINT32_MAX) {
        put32(out + 48, (uint32_t)(high - low));
        out[6] |= 4u;
    }
#endif
    put32(out + 52, UINT32_MAX);
#if (defined(__arm__) || defined(__thumb__)) && defined(NRF52832)
    uint32_t free_stack = stack_min_free();
    if (free_stack != UINT32_MAX) {
        put32(out + 52, free_stack);
        out[6] |= 8u;
    }
#endif
    put32(out + 56, saved.samples);
    put32(out + 60, saved.vfs_errors);
    return true;
}
#endif
