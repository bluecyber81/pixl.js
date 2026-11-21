/* SPDX-License-Identifier: GPL-2.0-only */
#ifndef PACKED_FS_H
#define PACKED_FS_H
#include "lfs.h"
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define PFS_FORMAT_VERSION 1u
#define PFS_BLOCK_SIZE 4096u
#define PFS_BLOCK_COUNT 512u
#define PFS_CACHE_SIZE 256u
#define PFS_SHARD_TARGET 32768u
#define PFS_MAX_SHARDS 64u
#define PFS_MAX_HANDLES 8u
#define PFS_PATH_MAX 64u
#define PFS_NAME_MAX 48u
#define PFS_META_SIZE 128u
#define PFS_FILE 1u
#define PFS_DIR 2u

typedef struct pfs pfs_t;
typedef struct pfs_file pfs_file_t;
typedef struct pfs_dir pfs_dir_t;
typedef void *(*pfs_alloc_fn)(size_t);
typedef void (*pfs_free_fn)(void *);
typedef struct {
  char path[PFS_PATH_MAX]; /* absolute canonical path, no drive prefix */
  uint32_t size;
  uint8_t type;
  uint8_t meta[PFS_META_SIZE];
} pfs_info_t;

/* cfg must provide synchronous read/prog/erase/sync and exactly 2MiB/4KiB/256B.
 * Its context is retained. Core owns bounded caches; no libc allocation. */
pfs_t *pfs_new(const struct lfs_config *cfg, pfs_alloc_fn alloc,
               pfs_free_fn release);
int pfs_destroy(pfs_t *fs); /* refuses open handles */
int pfs_mount(pfs_t *fs);   /* read-only, never initializes/formats */
int pfs_unmount(pfs_t *fs); /* refuses open handles */
int pfs_format(
    pfs_t *fs); /* explicit destructive format + empty packed store */
bool pfs_mounted(const pfs_t *fs);
bool pfs_poisoned(const pfs_t *fs);
bool pfs_idle(const pfs_t *fs);
/* Explicit format starts pending; only a verified client restore should finish.
 * Binding an archive digest is required before any logical mutation.
 * This is an identity binding, not an authentication or content-hash claim. */
bool pfs_import_pending(const pfs_t *fs);
bool pfs_get_import_identity(const pfs_t *fs, uint8_t out[32]);
int pfs_bind_import(pfs_t *fs, const uint8_t digest[32]);
int pfs_finish_import(pfs_t *fs);
int pfs_space(pfs_t *fs, uint32_t *total, uint32_t *free_bytes);
/* Mutations also reclaim obsolete objects after publication; open snapshots
 * defer their objects until the final retaining handle closes. Maintenance
 * failure never changes a durable mutation's success, but I/O uncertainty
 * still poisons subsequent writes until remount. Mount and ordinary reads on
 * a volume without a local mutation remain strictly read-only. */
int pfs_gc(pfs_t *fs); /* only unreferenced, unpinned owned physical objects */
#if defined(BOARD_LCD) && (defined(PIXL_RUNTIME_DIAGNOSTICS) || defined(PIXL_TEST_DIAGNOSTICS))
/* Foreground-only RAM snapshot. No allocation, LittleFS call or mutation.
 * held_handles counts readers/snapshots retaining one or more obsolete groups,
 * not unique groups or reclaimable bytes. state: 0 unknown, 1 pending, 2 clean.
 * last_result belongs to the most recent completed collect attempt in this
 * mount, and is meaningful only when flags bit4 is set. */
typedef struct {
  uint8_t flags, state, readers, directories, held_handles;
  uint32_t generation;
  int32_t last_result;
} pfs_gc_diagnostic_t;
bool pfs_gc_diagnostic(const pfs_t *fs, pfs_gc_diagnostic_t *out);
#endif
int pfs_stat(pfs_t *fs, const char *path, pfs_info_t *info);
int pfs_create_small(pfs_t *fs, const char *path, const uint8_t *data, size_t size);
int pfs_mkdir(pfs_t *fs, const char *path);
int pfs_setattr(pfs_t *fs, const char *path, const uint8_t meta[PFS_META_SIZE]);
int pfs_rename(pfs_t *fs, const char *path, const char *target);
int pfs_remove(pfs_t *fs, const char *path, bool recursive);

/* LFS_O_RDONLY/WRONLY/RDWR/CREAT/EXCL/TRUNC/APPEND are accepted.
 * One writer at a time. Readers retain immutable object snapshots.
 * Open writer creates only a private stage; close publishes atomically.
 * Failed close retains handle for abort. Commit I/O uncertainty poisons
 * mutations/GC until all handles close and a successful unmount/mount.
 * Success invalidates/frees handle. Abort does not publish staged content. */
int pfs_open(pfs_t *fs, const char *path, int flags, pfs_file_t **file);
lfs_ssize_t pfs_read(pfs_file_t *file, void *buffer, lfs_size_t size);
lfs_ssize_t pfs_write(pfs_file_t *file, const void *buffer, lfs_size_t size);
lfs_soff_t pfs_seek(pfs_file_t *file, lfs_soff_t offset, int whence);
int pfs_close(pfs_file_t *file);
/* Stage raw metadata on a writable private file; publication is at close. */
int pfs_file_set_meta(pfs_file_t *file, const uint8_t meta[PFS_META_SIZE]);
/* Zero means no healthy mounted snapshot. Not a persistent device identity. */
uint32_t pfs_generation(const pfs_t *fs);
int pfs_abort(pfs_file_t *file);
/* Atomically replace content plus raw128 metadata. NULL metadata preserves
 * an existing file's metadata; a new file receives zeros. Returns byte count
 * or a negative LFS error. Always releases its private writer on failure. */
lfs_ssize_t pfs_replace(pfs_t *fs, const char *path, const void *data,
                        lfs_size_t size, const uint8_t meta[PFS_META_SIZE]);
int pfs_opendir(pfs_t *fs, const char *path, pfs_dir_t **dir);
/* next returns 1=entry, 0=EOF, negative=LFS error; returns immediate children
 */
int pfs_readdir(pfs_dir_t *dir, pfs_info_t *info);
int pfs_closedir(pfs_dir_t *dir);

#endif
