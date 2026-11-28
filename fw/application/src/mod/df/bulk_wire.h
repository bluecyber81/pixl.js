/* SPDX-License-Identifier: GPL-2.0-only */
#ifndef BULK_WIRE_PROTOTYPE_H
#define BULK_WIRE_PROTOTYPE_H
#include "packed_fs.h"
#define BULK_BODY_MAX (2u + PFS_PATH_MAX-1u + PFS_BULK_LIMIT*(3u+PFS_NAME_MAX-1u+572u) + 32u)
typedef struct {
    uint64_t expected;
    uint32_t id;
    uint16_t total, used;
    uint8_t body[BULK_BODY_MAX];
} bulk_rx_t;
typedef struct {
    uint32_t id;
    uint64_t revision;
    uint8_t files;
} bulk_receipt_t;
typedef int (*bulk_hash_fn)(const uint8_t *,size_t,uint8_t out[32]);
/* This adapter owns the persistence/ACL guard, rechecks the private upload
 * leaf and mount epoch, and returns the committed revision while serialized. */
typedef int (*bulk_commit_fn)(uint64_t expected,const pfs_small_item_t *,unsigned,uint64_t *after);
enum { BULK_INVALID=-1, BULK_MORE=0, BULK_COMMITTED=1, BULK_DEFERRED=2, BULK_POLICY_DEFER=1 };
int bulk_frame(bulk_rx_t *rx, bool guarded, const uint8_t *frame, size_t bytes,
               bulk_hash_fn hash, bulk_commit_fn commit, bulk_receipt_t *receipt);
void bulk_forget(bulk_rx_t *rx);
#endif

