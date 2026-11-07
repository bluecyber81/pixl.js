/* Linux-only profiler using the production mount path and the bounded NOR fixture. */
#include <execinfo.h>
#include <inttypes.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "vfs_packed_runtime.h"

enum { MAX_FRAMES = 48, MAX_STACKS = 256, CACHE_RESULTS = 3 };
typedef struct {
    void *frames[MAX_FRAMES];
    int depth;
    unsigned counts[CACHE_RESULTS]; /* hit, eligible miss, bypass */
} read_stack_t;

static read_stack_t stacks[MAX_STACKS];
static size_t stack_count;
static bool observing;

static void observe_read(bool hit, bool eligible) {
    if (!observing) return;
    void *frames[MAX_FRAMES];
    int count = backtrace(frames, MAX_FRAMES);
    if (count <= 0 || count == MAX_FRAMES || (hit && !eligible)) abort();
    size_t index = 0;
    while (index < stack_count && (stacks[index].depth != count ||
            memcmp(stacks[index].frames, frames, count * sizeof(*frames)))) index++;
    if (index == stack_count) {
        if (index == MAX_STACKS) abort();
        ++stack_count;
        stacks[index].depth = count;
        memcpy(stacks[index].frames, frames, count * sizeof(*frames));
    }
    ++stacks[index].counts[hit ? 0 : eligible ? 1 : 2];
}

/* Keep production code byte-for-byte on disk. Only its host diagnostic sink changes. */
#define runtime_diag_mount_cache(hit, eligible) observe_read(hit, eligible)
#define main existing_contract_main
#include "packed_vfs_persistence_de344.c"
#undef main

static void report_stacks(void) {
    for (size_t i = 0; i < stack_count; ++i) {
        read_stack_t *s = &stacks[i];
        printf("READS %u %u %u", s->counts[0], s->counts[1], s->counts[2]);
        for (int f = 0; f < s->depth; ++f)
            printf(" %" PRIxPTR, (uintptr_t)s->frames[f] - 1);
        putchar('\n');
    }
    stack_count = 0;
    memset(stacks, 0, sizeof(stacks));
}

static void figure(unsigned id, char *path, size_t len) {
    snprintf(path, len, "/figure%03u.bin", id);
    new_data[0] = meta[0] = (uint8_t)id;
    new_data[1] = meta[1] = (uint8_t)(id >> 8);
}

static void check_collection(unsigned count) {
    char path[24];
    for (unsigned id = 0; id < count; ++id) {
        figure(id, path, sizeof(path));
        vfs_obj_t info;
        REQUIRE(driver()->stat_file(path, &info) == 0);
        REQUIRE(!memcmp(meta, info.meta, sizeof(meta)));
        REQUIRE(driver()->read_file_data(path, check, 540) == 540);
        REQUIRE(!memcmp(check, new_data, 540));
    }
    meta[0] = 17;
    meta[1] = 26;
    REQUIRE(state() == 0);
}

int main(void) {
    for (unsigned i = 0; i < sizeof(old_data); i++) {
        old_data[i] = (uint8_t)(i * 7 + 3);
        new_data[i] = (uint8_t)(i * 13 + 5);
    }
    for (unsigned i = 0; i < sizeof(meta); i++) meta[i] = (uint8_t)(i * 9 + 17);
    baseline();
    reset_baseline();
    for (unsigned count = 1; count <= 952; ++count) {
        char path[24];
        figure(count - 1, path, sizeof(path));
        REQUIRE(pfs_replace(store, path, new_data, 540, meta) == 540);
        if (count != 100 && count != 500 && count != 952) continue;
        for (unsigned repeat = 1; repeat <= 3; ++repeat) {
            drop();
            REQUIRE(configure() == 0);
            nor_reset_observation(&media);
            REQUIRE(pfs_mount(store) == 0);
            uint64_t uncached = media.stats.reads;
            REQUIRE(!media.stats.programs && !media.stats.erases);
            drop();
            nor_reset_observation(&media);
            peak = live;
            observing = true;
            REQUIRE(driver()->mount() == 0);
            observing = false;
            REQUIRE(!mount_pages && !media.stats.programs && !media.stats.erases);
            REQUIRE(media.stats.read_bytes == media.stats.reads * PFS_CACHE_SIZE);
            printf("SAMPLE %u %u %" PRIu64 " %" PRIu64 " %zu\n",
                    count, repeat, uncached, media.stats.reads, peak);
            report_stacks();
            check_collection(count);
        }
    }
    drop();
    nor_reset_observation(&media);
    read_calls = 0;
    read_fail_at = 30;
    REQUIRE(driver()->mount() < 0 && !pfs_mounted(store) && !mount_pages);
    REQUIRE(read_calls == read_fail_at);
    REQUIRE(!media.stats.programs && !media.stats.erases);
    read_fail_at = 0;
    REQUIRE(driver()->mount() == 0);
    REQUIRE(!media.stats.programs && !media.stats.erases);
    check_collection(952);
    drop();
    REQUIRE(live == 0);
    puts("RECOVERY PASS");
    return 0;
}
