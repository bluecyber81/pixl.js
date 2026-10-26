#ifndef BOOT_DIAG_H
#define BOOT_DIAG_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define BOOT_DIAG_SIZE 128u

#if defined(PIXL_BOOT_DIAGNOSTICS) && PIXL_BOOT_DIAGNOSTICS
/* Read-only, fixed-location information. Never initializes DFU settings,
 * changes flash/UICR, enters DFU, or returns raw memory/key/serial contents. */
bool boot_diag_snapshot(uint8_t *out, size_t capacity);
#else
static inline bool boot_diag_snapshot(uint8_t *out, size_t capacity) {
    (void)out; (void)capacity; return false;
}
#endif

#endif
