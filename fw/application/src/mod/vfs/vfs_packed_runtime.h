/* SPDX-License-Identifier: GPL-2.0-only */
#ifndef VFS_PACKED_RUNTIME_H
#define VFS_PACKED_RUNTIME_H
#include "boards.h"
#include "../runtime_diag.h"
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef VFS_PACKED_LFS_ENABLE
#include "vfs.h"
/* Cache identity changes after mutation and successful remount/format. */
uint64_t vfs_packed_revision(void);
#ifdef PIXL_SMALL_CREATE_ENABLE
#define VFS_SMALL_CREATE_MAX 572u
int32_t vfs_packed_create_small(char *path, uint64_t expected, const uint8_t *data, size_t size);
int32_t vfs_packed_publish_small(char *stage, const char *target, uint64_t expected);
#endif
/* Only a guarded external writer may attach raw128 to its private stage. */
int32_t vfs_packed_stage_meta(vfs_file_t *fd, const uint8_t meta[128]);
/* Adapter functions: physical geometry was checked before publishing it. */
bool vfs_packed_geometry_valid(void);
bool vfs_packed_import_pending(void);
bool vfs_packed_import_identity(uint8_t out[32]);
int32_t vfs_packed_bind_import(const uint8_t digest[32]);
int32_t vfs_packed_finish_import(void);
bool vfs_packed_handles_idle(void);
#if defined(BOARD_LCD) && (defined(PIXL_RUNTIME_DIAGNOSTICS) || defined(PIXL_TEST_DIAGNOSTICS))
#define VFS_PACKED_GC_DIAGNOSTIC_SIZE 24u
bool vfs_packed_gc_diagnostic(uint8_t *out, size_t capacity);
#endif

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
