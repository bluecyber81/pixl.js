#ifndef RUNTIME_DIAG_H
#define RUNTIME_DIAG_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

/* Optional LCD diagnostics. No files, addresses, payloads or persistent state. */
#define RUNTIME_DIAG_SIZE 64u
#define POWER_DIAG_SIZE 16u
#define STARTUP_DIAG_SIZE 32u

/* Milliseconds since the application starts storage initialization. This does
 * not measure bootloader/early SDK time or the panel's physical response. */
enum runtime_diag_startup_phase {
    STARTUP_STORAGE_BEGIN = 0,
    STARTUP_STORAGE_DONE,
    STARTUP_DISPLAY_BEGIN,
    STARTUP_DISPLAY_DONE,
    STARTUP_LAUNCHER_DONE,
    STARTUP_DISPATCH_DONE,
    STARTUP_PHASE_COUNT
};
enum runtime_diag_cause {
    RUNTIME_DIAG_NONE = 0,
    RUNTIME_DIAG_QUEUE_OVERFLOW = 1,
    RUNTIME_DIAG_FRAGMENT_TIMEOUT = 2,
    RUNTIME_DIAG_PROTOCOL = 3,
    RUNTIME_DIAG_TX_FAILURE = 4,
    RUNTIME_DIAG_GATT_CLIENT_TIMEOUT = 5,
    RUNTIME_DIAG_GATT_SERVER_TIMEOUT = 6
};
#define RUNTIME_DIAG_BAD_REQUEST (-1000)
#define RUNTIME_DIAG_BAD_STATE (-1001)

#if defined(PIXL_RUNTIME_DIAGNOSTICS)
void runtime_diag_boot_capture(uint32_t reset_reason);
void runtime_diag_startup_mark(unsigned phase, uint32_t elapsed_ms);
bool runtime_diag_startup_snapshot(uint8_t *out, size_t capacity);
void runtime_diag_power_sample(uint16_t voltage_mv, bool valid, bool lipo, bool charging, uint16_t sleep_seconds);
bool runtime_diag_power_snapshot(uint8_t *out, size_t capacity);
void runtime_diag_ble_abort(uint8_t cause);
void runtime_diag_ble_disconnected(uint8_t hci_reason);
void runtime_diag_vfs_error(uint8_t command, int32_t error);
void runtime_diag_heap_change(size_t old_size, size_t new_size, bool failed);
void runtime_diag_heap_reset(void);
void runtime_diag_heap_sample(uint32_t total, uint32_t free, uint32_t largest);
bool runtime_diag_snapshot(uint8_t *out, size_t capacity);
#else
static inline void runtime_diag_boot_capture(uint32_t reason) { (void)reason; }
static inline void runtime_diag_startup_mark(unsigned phase, uint32_t elapsed_ms) {
    (void)phase; (void)elapsed_ms;
}
static inline bool runtime_diag_startup_snapshot(uint8_t *out, size_t capacity) {
    (void)out; (void)capacity; return false;
}
static inline void runtime_diag_power_sample(uint16_t mv, bool valid, bool lipo, bool charging, uint16_t seconds) {
    (void)mv; (void)valid; (void)lipo; (void)charging; (void)seconds;
}
static inline bool runtime_diag_power_snapshot(uint8_t *out, size_t capacity) {
    (void)out; (void)capacity; return false;
}
static inline void runtime_diag_ble_abort(uint8_t cause) { (void)cause; }
static inline void runtime_diag_ble_disconnected(uint8_t reason) { (void)reason; }
static inline void runtime_diag_vfs_error(uint8_t command, int32_t error) { (void)command; (void)error; }
static inline void runtime_diag_heap_change(size_t old_size, size_t new_size, bool failed) {
    (void)old_size; (void)new_size; (void)failed;
}
static inline void runtime_diag_heap_reset(void) {}
static inline void runtime_diag_heap_sample(uint32_t total, uint32_t free, uint32_t largest) {
    (void)total; (void)free; (void)largest;
}
static inline bool runtime_diag_snapshot(uint8_t *out, size_t capacity) {
    (void)out; (void)capacity; return false;
}
#endif
#endif
