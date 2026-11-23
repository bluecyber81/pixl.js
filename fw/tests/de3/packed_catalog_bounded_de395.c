/* Exact PackedFS/LittleFS on a synthetic 2-MiB NOR. The fixture builder uses
 * the production record/index writer and is validated by a complete remount.
 * It creates many legal groups without thousands of incidental rewrites. */
#define main original_contract_main
#include CONTRACT
#undef main

static uint8_t fixture_disk[NOR_BYTES];
static catalog_t mounted_catalog[CATALOG_SLOTS];

static void object(unsigned group, unsigned record, pfs_info_t *info) {
    memset(info, 0, sizeof(*info));
    if (!record) {
        snprintf(info->path, sizeof(info->path), "/g%02u", group);
        info->type = PFS_DIR;
    } else {
        snprintf(info->path, sizeof(info->path), "/g%02u/r%02u", group, record - 1);
        info->type = PFS_FILE;
        info->size = 540;
    }
    for (unsigned i = 0; i < PFS_META_SIZE; ++i)
        info->meta[i] = (uint8_t)(group * 17 + record * 23 + i);
}

static void make_group(unsigned group, unsigned records, uint32_t id) {
    pfs_info_t info;
    uint32_t body = 0;
    for (unsigned j = 0; j < records; ++j) {
        object(group, j, &info);
        body += record_size(&info);
    }
    index_t index[MAX_RECORDS]; /* Host fixture memory, never firmware stack. */
    io_t output;
    char path[16];
    shard_name(id, path);
    REQUIRE(io_open(store, &output, path, LFS_O_WRONLY | LFS_O_CREAT | LFS_O_EXCL) == 0);
    uint8_t header[SH] = {0};
    put32(header, S_MAGIC); put32(header + 4, PFS_FORMAT_VERSION);
    put32(header + 8, id); put32(header + 12, records); put32(header + 16, body);
    put32(header + 20, ~crc(~0u, header, 20));
    REQUIRE(emit(store, &output, header, SH, NULL, NULL) == 0);
    uint32_t offset = SH, sum = ~0u;
    for (unsigned j = 0; j < records; ++j) {
        object(group, j, &info);
        index_add(index, j, path_hash(info.path), offset);
        REQUIRE(write_record(store, &output, &info, NULL, 0, old_data, &sum) == 0);
        offset += record_size(&info);
    }
    REQUIRE(offset == SH + body);
    for (unsigned j = 0; j < records; ++j) {
        uint8_t entry[IX];
        put32(entry, index[j].hash); put32(entry + 4, index[j].offset);
        put32(entry + 8, ~crc(~0u, entry, 8));
        REQUIRE(emit(store, &output, entry, IX, NULL, &sum) == 0);
    }
    put32(header, ~sum);
    REQUIRE(emit(store, &output, header, 4, NULL, NULL) == 0);
    REQUIRE(lfs_file_sync(&store->lfs, &output.f) == 0);
    REQUIRE(io_close(store, &output, 0) == 0);
}

static void fixture(unsigned groups, unsigned records) {
    if (store) drop();
    nor_init(&media); fail_at = read_fail_at = 0;
    REQUIRE(driver()->format() == 0);
    uint8_t identity[32] = {5};
    REQUIRE(vfs_packed_bind_import(identity) == 0);
    manifest_t m = store->current;
    m.generation++; m.count = groups; m.objects = groups * records;
    for (unsigned g = 0; g < groups; ++g) {
        uint32_t id = m.next_id++;
        make_group(g, records, id);
        m.ids[g] = id;
    }
    REQUIRE(publish(store, &m) == 0);
    REQUIRE(vfs_packed_finish_import() == 0);
    REQUIRE(pfs_gc(store) == 0);
    drop(); REQUIRE(driver()->mount() == 0);
    REQUIRE(store->current.count == groups && store->current.objects == groups * records);
    memcpy(fixture_disk, media.disk, NOR_BYTES);
    memcpy(mounted_catalog, store->catalog, sizeof(mounted_catalog));
}

static void observe_reset(void) {
    nor_reset_observation(&media); read_calls = read_fail_at = 0;
    store->lfs.rcache.block = (lfs_block_t)-1;
}
static uint64_t lookup_reads(const char *path, int expected) {
    observe_reset();
    size_t before = live;
    pfs_info_t info;
    REQUIRE(pfs_stat(store, path, &info) == expected);
    REQUIRE(live == before && !media.stats.programs && !media.stats.erases);
    if (!expected) {
        REQUIRE(!strcmp(info.path, path) && info.size == 540);
    }
    return media.stats.reads;
}

static void compare_case(unsigned groups, unsigned records) {
    fixture(groups, records);
    const size_t steady = live;
    char late[32]; snprintf(late, sizeof(late), "/g%02u/r00", groups - 1);
    uint64_t absent1 = lookup_reads("/g00/absent", LFS_ERR_NOENT);
    uint64_t absent2 = lookup_reads("/g00/absent", LFS_ERR_NOENT);
    uint64_t late1 = lookup_reads(late, 0), late2 = lookup_reads(late, 0);
    uint64_t early = lookup_reads("/g00/r00", 0);
    pfs_info_t info;
    for (unsigned g = 0; g < groups; ++g) {
        object(g, 1, &info);
        REQUIRE(driver()->read_file_data(info.path, check, sizeof(check)) == 540);
        REQUIRE(!memcmp(check, old_data, 540));
        pfs_info_t actual;
        REQUIRE(pfs_stat(store, info.path, &actual) == 0);
        REQUIRE(!memcmp(actual.meta, info.meta, PFS_META_SIZE));
    }
    pfs_dir_t *old_root, *old_dir;
    REQUIRE(pfs_opendir(store, "/", &old_root) == 0);
    REQUIRE(pfs_opendir(store, "/g00", &old_dir) == 0);
    uint8_t changed[PFS_META_SIZE]; memset(changed, 0xe5, sizeof(changed));
    observe_reset(); REQUIRE(pfs_setattr(store, late, changed) == 0);
    uint64_t edit = media.stats.reads;
    REQUIRE(pfs_stat(store, late, &info) == 0 && !memcmp(info.meta, changed, sizeof(changed)));
    observe_reset(); REQUIRE(pfs_remove(store, "/g00", true) == 0);
    uint64_t remove = media.stats.reads;
    REQUIRE(store->current.count == groups - 1);
    REQUIRE(pfs_stat(store, "/g00", &info) == LFS_ERR_NOENT);
    unsigned seen = 0;
    int next;
    while ((next = pfs_readdir(old_dir, &info)) > 0) {
        REQUIRE(!strncmp(info.path, "/g00/", 5)); ++seen;
    }
    REQUIRE(next == 0 && seen == records - 1);
    REQUIRE(pfs_closedir(old_dir) == 0);
    seen = 0;
    while ((next = pfs_readdir(old_root, &info)) > 0) ++seen;
    REQUIRE(next == 0 && seen == groups && pfs_closedir(old_root) == 0);
    REQUIRE(live == steady && pfs_gc(store) == 0);
    drop(); REQUIRE(driver()->mount() == 0);
    REQUIRE(pfs_stat(store, late, &info) == 0 && !memcmp(info.meta, changed, sizeof(changed)));
    REQUIRE(pfs_stat(store, "/g00/r00", &info) == LFS_ERR_NOENT);
    printf("{\"groups\":%u,\"recordsPerGroup\":%u,\"absentFirstReads\":%llu,\"absentRepeatReads\":%llu,"
           "\"lateFirstReads\":%llu,\"lateRepeatReads\":%llu,\"earlyReads\":%llu,\"setattrReads\":%llu,"
           "\"subtreeRemoveReads\":%llu,\"pfsBytes\":%zu,\"steadyRequestedHeap\":%zu}\n",
           groups, records, (unsigned long long)absent1, (unsigned long long)absent2,
           (unsigned long long)late1, (unsigned long long)late2, (unsigned long long)early,
           (unsigned long long)edit, (unsigned long long)remove, sizeof(pfs_t), steady);
}

static unsigned read_faults(void) {
    fixture(33, 4);
    memcpy(mounted_catalog, store->catalog, sizeof(mounted_catalog));
    unsigned tested = 0;
    size_t steady = live;
    const char *queries[] = {"/g00/absent", "/g00/r00"};
    for (unsigned q = 0; q < 2; ++q) {
        memcpy(store->catalog, mounted_catalog, sizeof(mounted_catalog));
        unsigned total = (unsigned)lookup_reads(queries[q], q ? 0 : LFS_ERR_NOENT);
        for (unsigned n = 1; n <= total; ++n) {
            memcpy(store->catalog, mounted_catalog, sizeof(mounted_catalog));
            observe_reset(); read_fail_at = n;
            pfs_info_t info;
            REQUIRE(pfs_stat(store, queries[q], &info) == LFS_ERR_IO);
            REQUIRE(read_calls >= n && live == steady && !store->lfs.mlist);
            REQUIRE(!media.stats.programs && !media.stats.erases);
            read_fail_at = 0;
            REQUIRE(pfs_stat(store, "/g00/r00", &info) == 0);
            ++tested;
        }
    }
    return tested;
}

static void restore_fixture(void) {
    if (store) drop();
    read_fail_at = fail_at = 0;
    memcpy(media.disk, fixture_disk, NOR_BYTES);
    REQUIRE(driver()->mount() == 0);
}
static void overwrite(io_t *io, uint32_t offset, const void *data, unsigned bytes) {
    REQUIRE(lfs_file_seek(&store->lfs, &io->f, offset, LFS_SEEK_SET) == (lfs_soff_t)offset);
    REQUIRE(lfs_file_write(&store->lfs, &io->f, data, bytes) == (lfs_ssize_t)bytes);
}
static void corruption(void) {
    /* Simulate post-mount media damage. The selected group collides with a
     * live mounted filter, so the new cold direct-search path is exercised.
     * Every visited index/header error and truncation must fail closed; a fresh
     * mount must still reject the full malformed immutable image. */
    fixture(33, 4);
    for (unsigned kind = 0; kind < 5; ++kind) {
        restore_fixture();
        uint32_t id = store->current.ids[0];
        REQUIRE(store->catalog[0].id != id);
        char path[16]; shard_name(id, path);
        io_t io;
        REQUIRE(io_open(store, &io, path, LFS_O_RDWR) == 0);
        uint8_t header[SH];
        REQUIRE(read_at(store, &io, 0, header, sizeof(header)) == 0);
        uint32_t count = u32(header + 12), body = u32(header + 16);
        if (kind == 0 || kind == 4) {
            if (kind == 0) header[20] ^= 1;
            else { put32(header + 12, MAX_RECORDS + 1); put32(header + 20, ~crc(~0u, header, 20)); }
            overwrite(&io, 0, header, sizeof(header));
        } else if (kind == 3) {
            REQUIRE(lfs_file_truncate(&store->lfs, &io.f, SH + body + count * IX + 3) == 0);
        } else {
            bool found = false;
            for (unsigned i = 0; i < count; ++i) {
                uint8_t entry[IX]; uint32_t at = SH + body + i * IX;
                REQUIRE(read_at(store, &io, at, entry, sizeof(entry)) == 0);
                if (u32(entry) != path_hash("/g00/r00")) continue;
                found = true;
                if (kind == 1) { entry[8] ^= 1; overwrite(&io, at, entry, sizeof(entry)); }
                else {
                    uint32_t record = u32(entry + 4);
                    uint8_t bad[RH];
                    REQUIRE(read_at(store, &io, record, bad, sizeof(bad)) == 0);
                    bad[8] = PFS_PATH_MAX; bad[9] = 0;
                    put32(bad + 12, ~crc(~0u, bad, 12));
                    overwrite(&io, record, bad, sizeof(bad));
                }
                break;
            }
            REQUIRE(found);
        }
        REQUIRE(io_close(store, &io, 0) == 0);
        observe_reset(); pfs_info_t info;
        REQUIRE(pfs_stat(store, "/g00/r00", &info) == LFS_ERR_CORRUPT);
        REQUIRE(!media.stats.programs && !media.stats.erases && !store->lfs.mlist);
        drop(); REQUIRE(driver()->mount() < 0 && !pfs_mounted(store));
    }
    restore_fixture();
}

int main(void) {
    for (unsigned i = 0; i < sizeof(old_data); ++i) old_data[i] = (uint8_t)(i * 19 + 7);
    const unsigned groups[] = {28, 32, 33, 54, 64};
    for (unsigned i = 0; i < sizeof(groups) / sizeof(*groups); ++i)
        compare_case(groups[i], groups[i] == 64 ? 32 : 44);
    unsigned failed_reads = read_faults();
    corruption();
    drop(); REQUIRE(!live);
    printf("{\"passed\":true,\"readFaultCases\":%u,\"corruptionCases\":5,\"pointerBytes\":%zu,\"liveAtEnd\":%zu}\n",
           failed_reads, sizeof(void *), live);
    puts("PASS bounded catalogue, exact data/raw128, mutation, old snapshots and read faults");
    return 0;
}
