#ifndef SETTINGS_STORAGE_SNAPSHOT_H
#define SETTINGS_STORAGE_SNAPSHOT_H

#include "vfs.h"

/* A settings-session snapshot, not a live free-space measurement. Storage
 * actions invalidate it; opening the storage detail page explicitly refreshes
 * it. The parent menu only peeks: even its first frame must not traverse the
 * filesystem just to show a storage percentage. */
typedef struct {
    vfs_stat_t stat;
    vfs_driver_t *driver;
    int32_t result;
    bool valid;
} settings_storage_snapshot_t;

static inline void settings_storage_snapshot_invalidate(settings_storage_snapshot_t *snapshot) {
    snapshot->valid = false;
}

static inline const vfs_stat_t *settings_storage_snapshot_peek(
    const settings_storage_snapshot_t *snapshot, const vfs_driver_t *driver) {
    if (!snapshot->valid || snapshot->driver != driver || snapshot->result != VFS_OK)
        return NULL;
    return &snapshot->stat;
}

int32_t settings_storage_snapshot_read(settings_storage_snapshot_t *snapshot,
                                       vfs_driver_t *driver, vfs_stat_t *stat);

#endif
