/* SPDX-License-Identifier: GPL-2.0-only */
#include "vfs_packed_runtime.h"
#ifdef VFS_PACKED_LFS_ENABLE
#include "vfs.h"
#include "vfs_driver_fs.h"
#include "packed_fs.h"
#include "vfs_packed_identity.h"
#include <string.h>

static bool recovery_latched;
static const uint8_t engine_sha256[32] = PIXL_PACKED_ENGINE_SHA256_BYTES;

static void put16(uint8_t *p, uint16_t x) { p[0] = (uint8_t)x; p[1] = (uint8_t)(x >> 8); }
static void put32(uint8_t *p, uint32_t x) {
    put16(p, (uint16_t)x); put16(p + 2, (uint16_t)(x >> 16));
}
bool vfs_packed_recovery_required(void) {
    return recovery_latched || !vfs_driver_fs.mounted() || vfs_packed_import_pending();
}
void vfs_packed_latch_recovery(void) {
    if (!vfs_driver_fs.mounted() || vfs_packed_import_pending()) recovery_latched = true;
}
int32_t vfs_packed_layout(uint8_t drive, uint8_t out[72]) {
    if (!out || drive != 'E') return VFS_ERR_NODEV;
    if (!vfs_packed_geometry_valid()) return VFS_ERR_NODEV;
    memset(out, 0, 72);
    out[0] = 1; out[1] = drive; out[2] = 3; out[3] = vfs_driver_fs.mounted();
    put32(out + 4, 0x31534650u); /* PFS1: on-disk format identity. */
    put32(out + 8, PFS_BLOCK_SIZE * PFS_BLOCK_COUNT);
    put32(out + 12, PFS_BLOCK_SIZE); put32(out + 16, PFS_BLOCK_COUNT);
    put16(out + 20, PFS_CACHE_SIZE); put16(out + 22, PFS_CACHE_SIZE);
    put16(out + 24, PFS_CACHE_SIZE); put16(out + 26, PFS_META_SIZE);
    put32(out + 28, PFS_SHARD_TARGET);
    out[32] = PFS_MAX_SHARDS; out[33] = PFS_PATH_MAX;
    out[34] = PFS_NAME_MAX; out[35] = PFS_MAX_HANDLES;
    put32(out + 36, 7u); /* no autoformat, raw128, atomic manifest */
    memcpy(out + 40, engine_sha256, sizeof(engine_sha256));
    return VFS_OK;
}
void vfs_packed_import_status(uint8_t drive, uint8_t out[40]) {
    memset(out, 0, 40);
    bool mounted = vfs_driver_fs.mounted();
    bool pending = mounted && vfs_packed_import_pending();
    out[0] = 1; out[1] = drive; out[2] = 3; out[3] = mounted;
    out[4] = pending; out[5] = mounted && !pending;
    out[6] = mounted && vfs_packed_import_identity(out + 8);
    out[7] = recovery_latched;
}
#endif
