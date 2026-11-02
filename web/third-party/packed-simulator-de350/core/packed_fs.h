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
int pfs_gc(pfs_t *fs); /* only unreferenced, unpinned owned physical objects */
int pfs_stat(pfs_t *fs, const char *path, pfs_info_t *info);
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
