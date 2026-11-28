/* SPDX-License-Identifier: GPL-2.0-only */
#ifndef PFS_GUARD_NEW_H
#define PFS_GUARD_NEW_H
#include "packed_fs.h"

/* Positive values cannot collide with negative littlefs/PackedFS errors. */
enum pfs_guard_result {
    PFS_GUARD_OK = 0,
    PFS_GUARD_DEFER = 1,
    PFS_GUARD_DENIED = 2,
    PFS_GUARD_COLLISION = 3,
    PFS_GUARD_INVALID = 4
};
/* Read-only, no allocation of its own. Users hold the foreground dispatcher
 * across guard + commit and verify the mount epoch and PackedFS generation.
 * Only DEFER means the client may use its existing full checked write path. */
int pfs_guard_new_files(pfs_t *fs, const pfs_small_item_t *items, unsigned count);
#endif
