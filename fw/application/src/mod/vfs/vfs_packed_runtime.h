/* SPDX-License-Identifier: GPL-2.0-only */
#ifndef VFS_PACKED_RUNTIME_H
#define VFS_PACKED_RUNTIME_H
#include "boards.h"
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef VFS_PACKED_LFS_ENABLE
/* Adapter functions: physical geometry was checked before publishing it. */
bool vfs_packed_geometry_valid(void);
bool vfs_packed_import_pending(void);
bool vfs_packed_import_identity(uint8_t out[32]);
int32_t vfs_packed_bind_import(const uint8_t digest[32]);
int32_t vfs_packed_finish_import(void);
bool vfs_packed_handles_idle(void);

/* Boot/format recovery is deliberately latched until restart, even after the
 * client has finished importing. Default RAM settings must never overwrite
 * the successfully restored persistent settings before they are reloaded. */
bool vfs_packed_recovery_required(void);
void vfs_packed_latch_recovery(void);
int32_t vfs_packed_layout(uint8_t drive, uint8_t out[72]);
void vfs_packed_import_status(uint8_t drive, uint8_t out[40]);
#else
static inline bool vfs_packed_recovery_required(void) { return false; }
static inline void vfs_packed_latch_recovery(void) {}
#endif
#endif
