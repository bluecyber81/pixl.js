/* SPDX-License-Identifier: GPL-2.0-only */
#include "boards.h"
#if defined(PIXL_SMALL_CREATE_ENABLE) && defined(VFS_PACKED_LFS_ENABLE)
#include "df_small_create.h"
#include "df_proto_vfs.h"
#include "df_core.h"
#include "vfs_packed_runtime.h"
#include "app_timer.h"
#include "mui_mem.h"
#include "mbedtls/sha256.h"
#include <stdint.h>
#include <string.h>

/* One transient RAM reservation per file-mode connection. All filesystem
 * work is synchronous on its foreground queue. Only the deadline stamp
 * is written by a timer IRQ. No path or handle outlives this reservation. */
typedef struct {
    uint64_t revision;
    uint32_t id;
    uint16_t total, received;
    uint8_t digest[32];
    char path[VFS_MAX_FULL_PATH_LEN];
    uint8_t bytes[VFS_SMALL_CREATE_MAX + 1];
} small_file_t;
static small_file_t *pending;
#ifdef PIXL_GROUP_CREATE_ENABLE
#include "bulk_wire.h"
static bulk_rx_t *bulk;
#endif
APP_TIMER_DEF(deadline_timer);
static bool timer_ready, needs_stop;
static uint32_t generation;
static volatile uint32_t expired_generation;

static void deadline(void *context) { expired_generation = (uint32_t)(uintptr_t)context; }

void df_small_create_cancel(void) {
    if (needs_stop && app_timer_stop(deadline_timer) == NRF_SUCCESS) needs_stop = false;
#ifdef PIXL_GROUP_CREATE_ENABLE
    if (bulk) { mui_mem_free(bulk); bulk = NULL; }
#endif
    if (pending) {
        mui_mem_free(pending);
        pending = NULL;
    }
}

/* Single-file and group requests share the timer and exactly one transient buffer. */
static void *reserve_input(size_t bytes) {
    if (!timer_ready) {
        if (app_timer_create(&deadline_timer, APP_TIMER_MODE_SINGLE_SHOT, deadline) != NRF_SUCCESS) return NULL;
        timer_ready = true;
    }
    df_small_create_cancel();
    if (needs_stop || generation == UINT32_MAX) return NULL;
    void *buffer = mui_mem_malloc(bytes);
    if (!buffer) return NULL;
    ++generation;
    if (app_timer_start(deadline_timer, APP_TIMER_TICKS(30000), (void *)(uintptr_t)generation) != NRF_SUCCESS) {
        mui_mem_free(buffer);
        return NULL;
    }
    needs_stop = true;
    return buffer;
}

void df_proto_vfs_expire_small(void) {
    if (expired_generation == generation && (pending
#ifdef PIXL_GROUP_CREATE_ENABLE
        || bulk
#endif
        )) df_small_create_cancel();
}

bool df_small_create_pending(void) {
    df_proto_vfs_expire_small();
    return pending != NULL
#ifdef PIXL_GROUP_CREATE_ENABLE
        || bulk != NULL
#endif
        ;
}

static uint16_t read16(const uint8_t *p) {
    return (uint16_t)p[0] | ((uint16_t)p[1] << 8);
}

static uint32_t read32(const uint8_t *p) {
    return read16(p) | ((uint32_t)read16(p + 2) << 16);
}

static uint64_t read64(const uint8_t *p) {
    return read32(p) | ((uint64_t)read32(p + 4) << 32);
}

static void put16(uint8_t *p, uint16_t value) {
    p[0] = (uint8_t)value;
    p[1] = (uint8_t)(value >> 8);
}

static void put64(uint8_t *p, uint64_t value) {
    for (unsigned i = 0; i < 8; ++i) { p[i] = (uint8_t)value; value >>= 8; }
}

static bool stage_name(const uint8_t *p, size_t size) {
    if (size < 10 || size > 14 || p[0] != '~' || p[1] != 'u') return false;
    for (size_t i = 2; i < size; ++i)
        if (!(p[i] >= '0' && p[i] <= '9') && !(p[i] >= 'a' && p[i] <= 'f')) return false;
    return true;
}

static bool allowed_path(const uint8_t *p, size_t size, bool require_stage_parent) {
    if (size < 3 || size >= VFS_MAX_FULL_PATH_LEN || memcmp(p, "E:/", 3)) return false;
    size_t start = 3;
    bool staged = false;
    for (size_t i = 3; i <= size; ++i) {
        if (i < size && p[i] != '/') {
            if (p[i] < 32 || p[i] == 127 || strchr("<>:\"\\|?*", p[i])) return false;
            continue;
        }
        size_t len = i - start;
        if (!len || len >= VFS_MAX_NAME_LEN || p[i-1] == '.' || p[i-1] == ' ') return false;
        if (start == 3 && len >= 9 && !memcmp(p + start, ".pixl_txn", 9)) return false;
        if (i == size) return !require_stage_parent || staged;
        if (stage_name(p + start, len)) staged = true;
        start = i + 1;
    }
    return false;
}

uint64_t df_small_available_revision(void) {
    if (!vfs_drive_enabled(VFS_DRIVE_EXT) || vfs_packed_recovery_required() ||
        vfs_packed_import_pending() || !vfs_packed_handles_idle()) return 0;
    vfs_driver_t *driver = vfs_get_driver(VFS_DRIVE_EXT);
    return driver && driver->mounted() ? vfs_packed_revision() : 0;
}

static void failure(uint8_t command, int32_t error) {
    df_frame_t out = {.cmd = command, .status = DF_STATUS_ERR};
    runtime_diag_vfs_error(command, error);
    df_core_send_frame(&out);
}

void df_small_create_capability(df_event_t *evt) {
    if (evt->type != DF_EVENT_DATA_RECEVIED) return;
    df_frame_t *in = evt->df;
    uint64_t revision = df_small_available_revision();
    if (in->length || in->status || in->chunk || !revision || !df_proto_vfs_is_idle()) {
        failure(in->cmd, VFS_ERR_FAIL);
        return;
    }
    df_frame_t out = {.cmd = in->cmd, .length = 16, .data = {'P','X','S','C',1,7}};
#ifdef PIXL_FILE_DIGEST_ENABLE
    /* A separate request preserves the strict legacy PXSC flag mask. */
    if (in->cmd == DF_PROTO_CMD_VFS_BATCH_CAP) {
        out.data[2] = 'B'; out.data[3] = 'R'; out.data[5] = DF_VFS_BATCH_MAX_FILES;
    }
#endif
#ifdef PIXL_GROUP_CREATE_ENABLE
    if (in->cmd == DF_PROTO_CMD_VFS_GUARD_CAP) {
        out.data[2] = 'G'; out.data[3] = 'A'; out.data[5] = PFS_BULK_LIMIT;
    }
    if (in->cmd == DF_PROTO_CMD_VFS_GROUP_CAP) {
        out.data[2] = 'B'; out.data[3] = 'G'; out.data[5] = PFS_BULK_LIMIT;
    }
#endif
    put16(out.data + 6, VFS_SMALL_CREATE_MAX);
    put64(out.data + 8, revision);
    df_core_send_frame(&out);
}

#ifdef PIXL_GROUP_CREATE_ENABLE
void df_proto_vfs_cancel_group(void) {
    if (bulk) df_small_create_cancel();
}
static int group_sha(const uint8_t *bytes, size_t size, uint8_t out[32]) {
    return mbedtls_sha256_ret(bytes, size, out, 0);
}
static int commit_group(uint64_t expected, const pfs_small_item_t *items, unsigned count, uint64_t *after) {
    if (df_small_available_revision() != expected) return VFS_ERR_FAIL;
    return (int)vfs_packed_create_group(expected, items, count, after);
}
static int commit_guarded(uint64_t expected, const pfs_small_item_t *items, unsigned count, uint64_t *after) {
    if (df_small_available_revision() != expected) return VFS_ERR_FAIL;
    int32_t result = vfs_packed_guarded_create(expected, items, count, after);
    return result == VFS_GUARD_DEFER ? BULK_POLICY_DEFER : result;
}
void df_group_request(df_event_t *evt) {
    if (evt->type != DF_EVENT_DATA_RECEVIED) return;
    df_frame_t *in = evt->df;
    df_proto_vfs_expire_small();
    if (in->status || in->chunk || !in->length || in->length > df_core_max_payload()) goto invalid;
    if (in->data[0] == 0) {
        if (in->length != 15 || bulk || !df_proto_vfs_is_idle() ||
            !read64(in->data + 5) || read64(in->data + 5) != df_small_available_revision()) goto invalid;
        bulk = reserve_input(sizeof(*bulk));
        if (!bulk) goto invalid;
        bulk_forget(bulk);
    }
    if (!bulk) goto invalid;
    bulk_receipt_t receipt;
    const bool guarded = in->cmd == DF_PROTO_CMD_VFS_GUARD_CREATE;
    const int state = bulk_frame(bulk, guarded, in->data, in->length, group_sha,
                                 guarded ? commit_guarded : commit_group, &receipt);
    if (state == BULK_MORE) return;
    if (state != BULK_COMMITTED && state != BULK_DEFERRED) goto invalid;
    df_small_create_cancel();
    df_frame_t reply = {.cmd = in->cmd, .length = 14};
    reply.data[0] = (uint8_t)state; reply.data[1] = receipt.files;
    for (unsigned i=0; i<4; ++i) reply.data[2+i] = (uint8_t)(receipt.id >> (8*i));
    put64(reply.data+6, receipt.revision);
    df_core_send_frame(&reply);
    return;
invalid:
    df_proto_vfs_cancel_group();
    failure(in->cmd, RUNTIME_DIAG_BAD_REQUEST);
}
#endif
static bool start(const uint8_t *payload, size_t length, uint32_t id, size_t *header) {
    if (length < 49 || !id || !df_proto_vfs_is_idle()) return false;
    uint64_t revision = read64(payload + 5);
    uint16_t size = read16(payload + 13), path_size = read16(payload + 47);
    if (!revision || df_small_available_revision() != revision || size > VFS_SMALL_CREATE_MAX ||
        path_size > length - 49 || !allowed_path(payload + 49, path_size, true)) return false;
    *header = 49 + path_size;
    if (length - *header > size) return false;
    pending = reserve_input(sizeof(*pending));
    if (!pending) return false;
    pending->revision = revision;
    pending->id = id;
    pending->received = 0;
    pending->total = size;
    memcpy(pending->digest, payload + 15, 32);
    memcpy(pending->path, payload + 49, path_size);
    pending->path[path_size] = 0;
    return true;
}

static int32_t commit(df_frame_t *out) {
    uint8_t *digest = out->data + 11;
    if (mbedtls_sha256_ret(pending->bytes, pending->total, digest, 0) ||
        memcmp(digest, pending->digest, 32) || df_small_available_revision() != pending->revision)
        return VFS_ERR_FAIL;
    char *bare = pending->path + VFS_DRIVE_LABEL_LEN;
    int32_t result = vfs_packed_create_small(bare, pending->revision, pending->bytes, pending->total);
    if (result != VFS_OK) return result;
    uint64_t revision = df_small_available_revision();
    vfs_driver_t *driver = vfs_get_driver(VFS_DRIVE_EXT);
    if (!revision || revision == pending->revision || !driver) return VFS_ERR_FAIL;
    int32_t seen = driver->read_file_data(bare, pending->bytes, pending->total + 1);
    if (seen < 0) return seen;
    if (seen != pending->total || mbedtls_sha256_ret(pending->bytes, seen, digest, 0) ||
        memcmp(digest, pending->digest, 32) || df_small_available_revision() != revision) return VFS_ERR_FAIL;
    out->data[0] = 1;
    put64(out->data + 3, revision);
    out->length = 43;
    return VFS_OK;
}

static bool publish(const uint8_t *p, size_t length, df_frame_t *out) {
    if (length < 13 || !df_proto_vfs_is_idle()) return false;
    uint64_t expected = read64(p + 1);
    size_t a = read16(p + 9);
    if (!expected || a > length - 13 || !allowed_path(p + 11, a, false)) return false;
    size_t b = read16(p + 11 + a);
    if (b != length - 13 - a || !allowed_path(p + 13 + a, b, false)) return false;
    char source[VFS_MAX_FULL_PATH_LEN], target[VFS_MAX_FULL_PATH_LEN];
    memcpy(source, p + 11, a); source[a] = 0;
    memcpy(target, p + 13 + a, b); target[b] = 0;
    char *sname = strrchr(source, '/') + 1, *tname = strrchr(target, '/') + 1;
    size_t parent = (size_t)(sname - source);
    if ((size_t)(tname - target) != parent || memcmp(source, target, parent) ||
        !stage_name((uint8_t *)sname, a - parent) || stage_name((uint8_t *)tname, b - parent) ||
        df_small_available_revision() != expected) return false;
    if (vfs_packed_publish_small(source + VFS_DRIVE_LABEL_LEN, target + VFS_DRIVE_LABEL_LEN, expected) != VFS_OK)
        return false;
    uint64_t after = df_small_available_revision();
    if (!after || after == expected) return false;
    out->data[0] = 3; put64(out->data + 1, after); out->length = 9;
    return true;
}

void df_small_create_request(df_event_t *evt) {
    if (evt->type != DF_EVENT_DATA_RECEVIED) return;
    df_frame_t *in = evt->df;
    df_frame_t out = {.cmd = in->cmd};
    const uint8_t *p = in->data;
    size_t size = in->length;
    df_proto_vfs_expire_small();
    if (in->status || in->chunk || size < 5) goto invalid;
    uint32_t id = read32(p + 1);
    size_t header;
    switch (p[0]) {
        case 0:
            if (!start(p, size, id, &header)) goto invalid;
            break;
        case 1:
            header = 7;
            if (!pending || id != pending->id || size <= header ||
                read16(p + 5) != pending->received || size - header > (size_t)(pending->total - pending->received))
                goto invalid;
            break;
        case 2:
            if (!pending || id != pending->id || size != 5) goto invalid;
            df_small_create_cancel();
            df_core_send_frame(&out);
            return;
        case 3:
            if (!publish(p, size, &out)) goto invalid;
            df_core_send_frame(&out);
            return;
        default: goto invalid;
    }
    memcpy(pending->bytes + pending->received, p + header, size - header);
    pending->received += size - header;
    put16(out.data + 1, pending->received);
    out.length = 3;
    if (pending->received == pending->total) {
        int32_t result = commit(&out);
        df_small_create_cancel();
        if (result != VFS_OK) { failure(in->cmd, result); return; }
    }
    df_core_send_frame(&out);
    return;
invalid:
    failure(in->cmd, RUNTIME_DIAG_BAD_REQUEST);
}
#endif
