#ifndef PACKED_TEST_NOR_FIXTURE_H
#define PACKED_TEST_NOR_FIXTURE_H

#include <stdint.h>
#include <stddef.h>
#include <setjmp.h>
#include "lfs.h"

#define NOR_BYTES (2u * 1024u * 1024u)
#define NOR_BLOCK 4096u
#define NOR_UNIT 256u
#define NOR_BLOCKS (NOR_BYTES / NOR_BLOCK)
#define NOR_TRACE_MAX 262144u
enum nor_event_kind { NOR_PROGRAM = 1, NOR_ERASE = 2, NOR_SYNC = 3 };
enum nor_fault_mode { NOR_NO_FAULT = 0, NOR_CUT_AFTER, NOR_TORN_HALF,
                      NOR_RETURN_IO_BEFORE };
typedef struct { uint32_t kind, block, off, bytes; } nor_event_t;
typedef struct {
    uint64_t reads, programs, erases, syncs, read_bytes, program_bytes;
    uint32_t erase_counts[NOR_BLOCKS];
    uint32_t event_count;
} nor_stats_t;
/* These storage/trace arrays model the HOST test rig, never device RAM. */
typedef struct {
    uint8_t disk[NOR_BYTES];
    nor_event_t trace[NOR_TRACE_MAX];
    nor_stats_t stats;
    enum nor_fault_mode fault_mode;
    uint32_t fault_at;
    int fault_triggered;
    jmp_buf *cut_target;
    uint8_t read_cache[NOR_UNIT], prog_cache[NOR_UNIT], lookahead[64];
    struct lfs_config config;
} nor_fixture_t;

void nor_init(nor_fixture_t *n);
void nor_reset_observation(nor_fixture_t *n);
void nor_arm(nor_fixture_t *n, enum nor_fault_mode mode, uint32_t at,
             jmp_buf *target);
void nor_disarm(nor_fixture_t *n);
void nor_assert(int condition, const char *description, int line);
#define REQUIRE(x) nor_assert(!!(x), #x, __LINE__)
#endif
