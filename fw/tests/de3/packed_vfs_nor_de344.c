#include "packed_vfs_nor_de344.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void nor_assert(int condition, const char *description, int line) {
    if (!condition) {
        fprintf(stderr, "ASSERT line %d: %s\n", line, description);
        exit(71);
    }
}
static uint32_t begin_event(nor_fixture_t *n, uint32_t kind,
                            uint32_t block, uint32_t off, uint32_t bytes) {
    /* Long collection imports may exceed the detailed host trace capacity;
     * counts remain exact. Fault loops only use traces below this limit. */
    REQUIRE(n->stats.event_count < UINT32_MAX);
    if (n->stats.event_count < NOR_TRACE_MAX)
        n->trace[n->stats.event_count] = (nor_event_t){kind, block, off, bytes};
    return ++n->stats.event_count;
}
static int target_event(nor_fixture_t *n, uint32_t event) {
    return n->fault_mode != NOR_NO_FAULT && n->fault_at == event;
}
static void cut(nor_fixture_t *n) {
    REQUIRE(n->cut_target != NULL);
    n->fault_triggered = 1;
    longjmp(*n->cut_target, 1);
}
static int io_before(nor_fixture_t *n, uint32_t event) {
    if (target_event(n, event) && n->fault_mode == NOR_RETURN_IO_BEFORE) {
        n->fault_triggered = 1;
        return LFS_ERR_IO;
    }
    return 0;
}
static int read_cb(const struct lfs_config *c, lfs_block_t b, lfs_off_t off,
                   void *buffer, lfs_size_t bytes) {
    nor_fixture_t *n = c->context;
    REQUIRE(b < NOR_BLOCKS && off <= NOR_BLOCK && bytes <= NOR_BLOCK - off);
    REQUIRE(off % NOR_UNIT == 0 && bytes % NOR_UNIT == 0);
    ++n->stats.reads;
    n->stats.read_bytes += bytes;
    memcpy(buffer, n->disk + b * NOR_BLOCK + off, bytes);
    return 0;
}
static int prog_cb(const struct lfs_config *c, lfs_block_t b, lfs_off_t off,
                   const void *buffer, lfs_size_t bytes) {
    nor_fixture_t *n = c->context;
    REQUIRE(b < NOR_BLOCKS && off <= NOR_BLOCK && bytes <= NOR_BLOCK - off);
    REQUIRE(off % NOR_UNIT == 0 && bytes % NOR_UNIT == 0 && bytes != 0);
    uint32_t event = begin_event(n, NOR_PROGRAM, b, off, bytes);
    if (io_before(n, event)) return LFS_ERR_IO;
    const uint8_t *p = buffer;
    size_t count = bytes;
    if (target_event(n, event) && n->fault_mode == NOR_TORN_HALF) count /= 2;
    for (size_t i = 0; i < count; ++i) {
        REQUIRE((n->disk[b * NOR_BLOCK + off + i] & p[i]) == p[i]);
        n->disk[b * NOR_BLOCK + off + i] &= p[i];
    }
    ++n->stats.programs;
    n->stats.program_bytes += count;
    if (target_event(n, event) &&
        (n->fault_mode == NOR_CUT_AFTER || n->fault_mode == NOR_TORN_HALF)) cut(n);
    return 0;
}
static int erase_cb(const struct lfs_config *c, lfs_block_t b) {
    nor_fixture_t *n = c->context;
    REQUIRE(b < NOR_BLOCKS);
    uint32_t event = begin_event(n, NOR_ERASE, b, 0, NOR_BLOCK);
    if (io_before(n, event)) return LFS_ERR_IO;
    size_t count = NOR_BLOCK;
    if (target_event(n, event) && n->fault_mode == NOR_TORN_HALF) count /= 2;
    memset(n->disk + b * NOR_BLOCK, 255, count);
    ++n->stats.erases;
    ++n->stats.erase_counts[b];
    if (target_event(n, event) &&
        (n->fault_mode == NOR_CUT_AFTER || n->fault_mode == NOR_TORN_HALF)) cut(n);
    return 0;
}
static int sync_cb(const struct lfs_config *c) {
    nor_fixture_t *n = c->context;
    uint32_t event = begin_event(n, NOR_SYNC, 0, 0, 0);
    if (io_before(n, event)) return LFS_ERR_IO;
    ++n->stats.syncs;
    if (target_event(n, event) &&
        (n->fault_mode == NOR_CUT_AFTER || n->fault_mode == NOR_TORN_HALF)) cut(n);
    return 0;
}
void nor_reset_observation(nor_fixture_t *n) {
    memset(&n->stats, 0, sizeof(n->stats));
    n->fault_triggered = 0;
}
void nor_disarm(nor_fixture_t *n) {
    n->fault_mode = NOR_NO_FAULT;
    n->fault_at = 0;
    n->cut_target = NULL;
}
void nor_arm(nor_fixture_t *n, enum nor_fault_mode mode, uint32_t at,
             jmp_buf *target) {
    REQUIRE(mode != NOR_NO_FAULT && at > 0);
    nor_reset_observation(n);
    n->fault_mode = mode;
    n->fault_at = at;
    n->cut_target = target;
}
void nor_init(nor_fixture_t *n) {
    memset(n, 0, sizeof(*n));
    memset(n->disk, 255, sizeof(n->disk));
    n->config = (struct lfs_config){
        .context = n, .read = read_cb, .prog = prog_cb, .erase = erase_cb,
        .sync = sync_cb, .read_size = NOR_UNIT, .prog_size = NOR_UNIT,
        .block_size = NOR_BLOCK, .block_count = NOR_BLOCKS, .block_cycles = 500,
        .cache_size = NOR_UNIT, .lookahead_size = sizeof(n->lookahead),
        .read_buffer = n->read_cache, .prog_buffer = n->prog_cache,
        .lookahead_buffer = n->lookahead, .name_max = 63, .attr_max = 128
    };
}

