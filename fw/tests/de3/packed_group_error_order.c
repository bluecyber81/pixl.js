/* Real LittleFS/NOR and two published shards. Private engine access is used
 * only to prepare corruption after a successful mount and inspect the latch. */
#include "packed_fs.c"
#include "packed_vfs_nor_de344.h"
#include <stdio.h>
#include <stdlib.h>

static nor_fixture_t nor;
static pfs_t *volume;
static uint8_t clean[NOR_BYTES], prior[NOR_BYTES];
static uint8_t large[32500], medium[1000], metadata[128];
static const char first[] = "/xsejyjeqmo", alias[] = "/zctytfpgbn";
static const char second[] = "/later", extra[] = "/new";
static uint32_t generation;
static bool fail_read;
static int (*read_nor)(const struct lfs_config *, lfs_block_t, lfs_off_t, void *, lfs_size_t);

static int once(const struct lfs_config *cfg, lfs_block_t block, lfs_off_t off,
                void *bytes, lfs_size_t size) {
    if (fail_read) {
        fail_read = false;
        return LFS_ERR_IO;
    }
    return read_nor(cfg, block, off, bytes, size);
}

static void start(bool restore) {
    nor_init(&nor);
    read_nor = nor.config.read;
    nor.config.read = once;
    volume = pfs_new(&nor.config, malloc, free);
    REQUIRE(volume);
    if (restore) {
        memcpy(nor.disk, clean, sizeof(clean));
        REQUIRE(pfs_mount(volume) == 0 && pfs_generation(volume) == generation);
    }
}

static void stop(void) {
    REQUIRE(pfs_unmount(volume) == 0 && pfs_destroy(volume) == 0);
}

static void corrupt(unsigned slot) {
    uint32_t id = volume->current.ids[slot], count, body;
    io_t io;
    char name[16];
    uint8_t byte;
    shard_name(id, name);
    REQUIRE(io_open(volume, &io, name, LFS_O_RDWR) == 0);
    REQUIRE(shard_header(volume, &io, id, &count, &body) == 0 && count == 1);
    const uint32_t crcpos = SH + body + 8;
    REQUIRE(read_at(volume, &io, crcpos, &byte, 1) == 0);
    REQUIRE(lfs_file_seek(&volume->lfs, &io.f, crcpos, LFS_SEEK_SET) == (lfs_soff_t)crcpos);
    byte ^= 1;
    REQUIRE(lfs_file_write(&volume->lfs, &io.f, &byte, 1) == 1);
    REQUIRE(io_close(volume, &io, 0) == 0);
}

static void check_pair(const char *a, const char *b, int expected, bool latched) {
    const pfs_small_item_t siblings[]={{a, medium, 1},{b, medium, 1}};
    memcpy(prior, nor.disk, sizeof(prior));
    REQUIRE(pfs_create_small_group(volume, generation, siblings, 2) == expected);
    REQUIRE(!memcmp(prior, nor.disk, sizeof(prior)));
    REQUIRE(volume->current.generation == generation && volume->poisoned == latched);
    if (latched) {
        REQUIRE(pfs_generation(volume) == 0 &&
                pfs_create_small_group(volume, generation, siblings, 2) == LFS_ERR_IO);
        REQUIRE(!memcmp(prior, nor.disk, sizeof(prior)));
    }
}

int main(void) {
    start(false);
    REQUIRE(pfs_format(volume) == 0);
    const uint8_t binding[32]={82};
    REQUIRE(pfs_bind_import(volume,binding) == 0 && pfs_finish_import(volume) == 0);
    REQUIRE(path_hash(first) == path_hash(alias));
    REQUIRE(pfs_replace(volume, first, large, sizeof(large), metadata) == sizeof(large));
    REQUIRE(pfs_replace(volume, second, medium, sizeof(medium), metadata) == sizeof(medium));
    REQUIRE(volume->current.count == 2);
    generation = pfs_generation(volume);
    stop();
    memcpy(clean, nor.disk, sizeof(clean));

    start(true); corrupt(1); check_pair(second, first, LFS_ERR_CORRUPT, true); stop();
    start(true); corrupt(1); check_pair(first, second, LFS_ERR_EXIST, false); stop();
    start(true); corrupt(0); check_pair(second, first, LFS_ERR_EXIST, true); stop();
    start(true); corrupt(0); check_pair(first, second, LFS_ERR_CORRUPT, true); stop();

    /* The transient read failure must survive even when the ordered replay
     * finds no files, or finds an earlier existing logical path. */
    start(true); fail_read=true; check_pair(alias, extra, LFS_ERR_IO, true);
    REQUIRE(!fail_read); stop();
    start(true); fail_read=true; check_pair(first, extra, LFS_ERR_EXIST, true);
    REQUIRE(!fail_read); stop();

    for (unsigned cold = 0; cold < 2; cold++) {
        start(true);
        char shard[16];
        shard_name(volume->current.ids[0], shard);
        REQUIRE(lfs_remove(&volume->lfs, shard) == 0);
        if (cold) memset(volume->catalog, 0, sizeof(volume->catalog));
        check_pair(alias, extra, LFS_ERR_CORRUPT, true);
        stop();
    }
    start(true);
    const pfs_small_item_t fresh[]={{alias,medium,1},{extra,medium,1}};
    REQUIRE(pfs_create_small_group(volume,generation,fresh,2)==0);
    REQUIRE(pfs_generation(volume)==generation+1 && !volume->poisoned);
    stop();
    puts("Two-shard order, one-shot reads, cached/cold missing shards, unchanged media and clean recovery passed.");
}
