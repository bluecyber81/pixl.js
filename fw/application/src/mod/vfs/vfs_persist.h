#ifndef VFS_PERSIST_H
#define VFS_PERSIST_H

#include "vfs.h"

/* One shared, bounded journal. Canonical files retain their original format.
 * This detects interrupted writes; it does not make SPIFFS/flash atomic. */
#define VFS_PERSIST_MAX_DATA 2048
void vfs_persist_bind(const vfs_driver_t *public_driver, const vfs_driver_t *raw_driver);
int32_t vfs_persist_recover(vfs_driver_t *driver);
int32_t vfs_persist_write(vfs_driver_t *driver, const char *path, const void *data, size_t size);
/* Optional exact 128-byte new metadata, committed with the data. NULL preserves
 * existing metadata (or zero metadata for a new file). */
int32_t vfs_persist_write_meta(vfs_driver_t *driver, const char *path, const void *data,
                               size_t size, const uint8_t *meta);
bool vfs_persist_reserved(const char *path);
/* Call BEFORE every external mutation (including writes on an already open
 * handle). Invalidating a matching pending transaction must succeed first.
 * Raw journal callbacks must never call this function recursively. */
int32_t vfs_persist_before_mutation(const vfs_driver_t *driver, const char *path);
/* A streamed external writer excludes journal saves until its successful close. */
int32_t vfs_persist_writer_begin(const vfs_driver_t *driver, const char *path);
void vfs_persist_writer_end(const vfs_driver_t *driver);
bool vfs_persist_active(const vfs_driver_t *driver);
/* Only after a real unmount, or after a fresh successful mount. */
void vfs_persist_unmounted(const vfs_driver_t *driver);

#endif
