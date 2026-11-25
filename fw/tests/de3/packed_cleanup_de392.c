/* Publication/cleanup contract on the unchanged synthetic 2-MiB NOR rig. */
#include "lfs.h"
static int watched_rename(lfs_t *, const char *, const char *);
static int watched_remove(lfs_t *, const char *);
static int watched_dir_open(lfs_t *, lfs_dir_t *, const char *);
static int watched_sync(lfs_t *, lfs_file_t *);
static int watched_open(lfs_t *, lfs_file_t *, const char *, int, const struct lfs_file_config *);
static int watched_close(lfs_t *, lfs_file_t *);
#define lfs_rename watched_rename
#define lfs_remove watched_remove
#define lfs_dir_open watched_dir_open
#define lfs_file_sync watched_sync
#define lfs_file_opencfg watched_open
#define lfs_file_close watched_close
#define main original_contract_main
#include CONTRACT
#undef main
#undef lfs_rename
#undef lfs_remove
#undef lfs_dir_open
#undef lfs_file_sync
#undef lfs_file_opencfg
#undef lfs_file_close

static unsigned root_scans, published, cleanup_removes, successful_cleanup_faults;
static unsigned lifecycle_cases, crash_cases, cleanup_crashes, readonly_cases;
static unsigned publish_event, publish_read, injected_cleanup, injected_sync;
static int cleanup_error;
static uint8_t other_meta[PFS_META_SIZE], snapshot_disk[NOR_BYTES];

/* Observe the durable namespace change on both littlefs publication paths:
 * an ordinary manifest COW sync or an initial/staged rename. */
static lfs_file_t *direct_manifest;
static void note_publication(void) {
    ++published;
    publish_event = media.stats.event_count;
    publish_read = read_calls;
}
static int watched_open(lfs_t *lfs, lfs_file_t *file, const char *path, int flags,
                        const struct lfs_file_config *cfg) {
    int r = lfs_file_opencfg(lfs, file, path, flags, cfg);
    if (!r && (flags & LFS_O_TRUNC) && !strcmp(path, MANIFEST))
        direct_manifest = file;
    return r;
}
static int watched_close(lfs_t *lfs, lfs_file_t *file) {
    if (direct_manifest == file) direct_manifest = NULL;
    return lfs_file_close(lfs, file);
}
static int watched_rename(lfs_t *lfs, const char *from, const char *to) {
    int r = lfs_rename(lfs, from, to);
    if (!r && !strcmp(to, MANIFEST)) note_publication();
    return r;
}
static int watched_remove(lfs_t *lfs, const char *path) {
    if (published) {
        ++cleanup_removes;
        if (injected_cleanup && !--injected_cleanup)
            return cleanup_error;
    }
    return lfs_remove(lfs, path);
}
static int watched_dir_open(lfs_t *lfs, lfs_dir_t *dir, const char *path) {
    if (!strcmp(path, "/"))
        ++root_scans;
    return lfs_dir_open(lfs, dir, path);
}
static int watched_sync(lfs_t *lfs, lfs_file_t *file) {
    if (injected_sync && !--injected_sync)
        return LFS_ERR_NOSPC;
    int r = lfs_file_sync(lfs, file);
    if (!r && file == direct_manifest) note_publication();
    return r;
}
static void watch_reset(void) {
    direct_manifest = NULL;
    root_scans = published = cleanup_removes = publish_event = publish_read = 0;
    injected_cleanup = injected_sync = 0;
    cleanup_error = 0;
    read_calls = read_fail_at = 0;
    nor_reset_observation(&media);
}
static void restart_case(void) {
    injected_cleanup = injected_sync = read_fail_at = 0;
    reset_baseline();
    watch_reset();
}
/* Inspect physical names without production scan instrumentation. */
static unsigned obsolete(void) {
    lfs_dir_t dir;
    REQUIRE(lfs_dir_open(&store->lfs, &dir, "/") == 0);
    struct lfs_info info;
    unsigned count = 0;
    int r;
    while ((r = lfs_dir_read(&store->lfs, &dir, &info)) > 0) {
        uint32_t id;
        if (shard_id(info.name, &id) && !manifest_has(&store->current, id))
            ++count;
    }
    REQUIRE(r == 0 && lfs_dir_close(&store->lfs, &dir) == 0);
    return count;
}
static bool physical_exists(const char *path) {
    struct lfs_info info;
    int r = lfs_stat(&store->lfs, path, &info);
    REQUIRE(r == 0 || r == LFS_ERR_NOENT);
    return r == 0;
}
static void clean(void) {
    REQUIRE(obsolete() == 0);
    REQUIRE(!physical_exists(STAGE) && !physical_exists(NEXT));
    REQUIRE(!pfs_poisoned(store) && vfs_packed_handles_idle());
}
static void expect_file(const char *path, const uint8_t *data, const uint8_t *metadata) {
    REQUIRE(driver()->read_file_data(path, check, sizeof(check)) == 2048);
    REQUIRE(!memcmp(check, data, 2048));
    vfs_obj_t info;
    REQUIRE(driver()->stat_file(path, &info) == 0);
    REQUIRE(info.size == 2048 && !memcmp(info.meta, metadata, PFS_META_SIZE));
}
static void immediate(void) {
    restart_case();
    for (unsigned i = 0; i < 20; ++i) {
        REQUIRE(vfs_persist_write_meta(driver(), "/saved", i & 1 ? old_data : new_data,
                                      2048, i & 1 ? meta : other_meta) == 2048);
        clean();
        expect_file("/saved", i & 1 ? old_data : new_data, i & 1 ? meta : other_meta);
        ++lifecycle_cases;
    }
    REQUIRE(driver()->create_dir("/folder") == 0); clean(); ++lifecycle_cases;
    REQUIRE(driver()->update_file_meta("/saved", other_meta, 128) == 0);
    clean(); expect_file("/saved", old_data, other_meta); ++lifecycle_cases;
    REQUIRE(driver()->rename_file("/saved", "/folder/moved") == 0);
    clean(); expect_file("/folder/moved", old_data, other_meta); ++lifecycle_cases;
    REQUIRE(driver()->rename_dir("/folder", "/renamed") == 0);
    clean(); expect_file("/renamed/moved", old_data, other_meta); ++lifecycle_cases;
    REQUIRE(driver()->remove_dir("/renamed") == 0); clean(); ++lifecycle_cases;
    vfs_obj_t obj;
    REQUIRE(driver()->stat_file("/renamed/moved", &obj) == VFS_ERR_NOOBJ);
    puts("PASS immediate writer/mkdir/raw128/rename/subtree-remove reclamation");
}
static void snapshots(void) {
    /* Three identical pins: neither ordinary new reads nor non-final closes scan. */
    restart_case();
    pfs_dir_t *a, *b;
    pfs_file_t *reader;
    REQUIRE(pfs_opendir(store, "/", &a) == 0);
    REQUIRE(pfs_opendir(store, "/", &b) == 0);
    REQUIRE(pfs_open(store, "/saved", LFS_O_RDONLY, &reader) == 0);
    REQUIRE(pfs_replace(store, "/saved", new_data, 2048, other_meta) == 2048);
    REQUIRE(obsolete() == 1);
    root_scans = 0;
    for (unsigned i = 0; i < 16; ++i)
        expect_file("/saved", new_data, other_meta);
    REQUIRE(root_scans == 0);
    REQUIRE(pfs_read(reader, check, sizeof(check)) == 2048);
    REQUIRE(!memcmp(check, old_data, 2048));
    REQUIRE(pfs_closedir(a) == 0 && root_scans == 0);
    REQUIRE(pfs_close(reader) == 0 && root_scans == 0);
    pfs_info_t info;
    REQUIRE(pfs_readdir(b, &info) == 1 && !strcmp(info.path, "/saved"));
    REQUIRE(!memcmp(info.meta, meta, 128));
    REQUIRE(pfs_closedir(b) == 0 && root_scans > 0);
    clean(); lifecycle_cases += 4;

    /* Different generations release independently, leaving the other reader valid. */
    restart_case();
    REQUIRE(pfs_opendir(store, "/", &a) == 0);
    REQUIRE(pfs_replace(store, "/saved", new_data, 2048, other_meta) == 2048);
    REQUIRE(pfs_open(store, "/saved", LFS_O_RDONLY, &reader) == 0);
    REQUIRE(pfs_replace(store, "/saved", old_data, 2048, meta) == 2048);
    REQUIRE(obsolete() == 2);
    REQUIRE(pfs_closedir(a) == 0 && obsolete() == 1);
    REQUIRE(pfs_read(reader, check, sizeof(check)) == 2048);
    REQUIRE(!memcmp(check, new_data, 2048));
    REQUIRE(pfs_close(reader) == 0); clean(); lifecycle_cases += 2;

    /* A cancelled BLE read drops the same last immutable reference as close. */
    restart_case();
    REQUIRE(pfs_open(store, "/saved", LFS_O_RDONLY, &reader) == 0);
    REQUIRE(pfs_replace(store, "/saved", new_data, 2048, other_meta) == 2048);
    REQUIRE(obsolete() == 1);
    REQUIRE(pfs_abort(reader) == 0); clean();
    expect_file("/saved", new_data, other_meta); ++lifecycle_cases;

    /* Releasing the last old reader while a writer is open cannot remove stage. */
    restart_case();
    REQUIRE(pfs_open(store, "/saved", LFS_O_RDONLY, &reader) == 0);
    REQUIRE(pfs_replace(store, "/saved", new_data, 2048, other_meta) == 2048);
    pfs_file_t *writer;
    REQUIRE(pfs_open(store, "/saved", LFS_O_WRONLY | LFS_O_TRUNC, &writer) == 0);
    REQUIRE(pfs_write(writer, old_data, 2048) == 2048);
    root_scans = 0;
    REQUIRE(pfs_close(reader) == 0 && root_scans == 0);
    REQUIRE(physical_exists(STAGE) && obsolete() == 1);
    REQUIRE(pfs_abort(writer) == 0); clean();
    expect_file("/saved", new_data, other_meta); lifecycle_cases += 2;
    puts("PASS overlapping and distinct snapshots; no scan on irrelevant close; writer owns stage");
}
static void readonly_mount(void) {
    restart_case();
    /* Leave a real stale generation by simulating reset with the pin still open. */
    pfs_file_t *reader;
    REQUIRE(pfs_open(store, "/saved", LFS_O_RDONLY, &reader) == 0);
    REQUIRE(pfs_replace(store, "/saved", new_data, 2048, other_meta) == 2048);
    REQUIRE(obsolete() == 1);
    for (unsigned i = 0; i < 128; ++i)
        if (owners[i]) mui_mem_free(owners[i]);
    store = NULL; vfs_persist_unmounted(driver()); REQUIRE(live == 0);
    memcpy(snapshot_disk, media.disk, NOR_BYTES);
    watch_reset();
    REQUIRE(driver()->mount() == 0);
    expect_file("/saved", new_data, other_meta);
    pfs_dir_t *dir; pfs_info_t info;
    REQUIRE(pfs_opendir(store, "/", &dir) == 0);
    while (pfs_readdir(dir, &info) > 0) {}
    REQUIRE(pfs_closedir(dir) == 0);
    uint32_t total, free_bytes;
    REQUIRE(pfs_space(store, &total, &free_bytes) == 0);
    REQUIRE(root_scans == 0 && !media.stats.programs && !media.stats.erases);
    REQUIRE(!memcmp(snapshot_disk, media.disk, NOR_BYTES) && obsolete() == 1);
    readonly_cases += 4;
    REQUIRE(driver()->create_dir("/first-mutation") == 0); clean();
    expect_file("/saved", new_data, other_meta); ++lifecycle_cases;
    puts("PASS read-only remount/read/list/space preserve stale NOR; next mutation reclaims it");
}
static void maintenance_failure(void) {
    for (unsigned which = 0; which < 2; ++which) {
        restart_case();
        cleanup_error = which ? LFS_ERR_IO : LFS_ERR_NOSPC;
        injected_cleanup = 1;
        REQUIRE(pfs_replace(store, "/saved", new_data, 2048, other_meta) == 2048);
        REQUIRE(!injected_cleanup && published == 1 && obsolete() == 1);
        REQUIRE(pfs_poisoned(store) == (bool)which);
        expect_file("/saved", new_data, other_meta);
        if (which) {
            REQUIRE(driver()->create_dir("/blocked") < 0);
            drop(); REQUIRE(driver()->mount() == 0);
        }
        REQUIRE(driver()->create_dir("/retry") == 0); clean();
        expect_file("/saved", new_data, other_meta);
        ++successful_cleanup_faults;
    }
    /* Direct import publications use NEXT too; an unsuccessful sync cannot leave
     * a CLEAN hint that makes the subsequent writer collide with the old NEXT. */
    restart_case(); drop(); nor_init(&media);
    REQUIRE(driver()->format() == 0);
    uint8_t identity[32] = {3};
    REQUIRE(vfs_packed_bind_import(identity) == 0);
    watch_reset(); injected_sync = 1;
    REQUIRE(vfs_packed_finish_import() == VFS_ERR_NOSPC && !injected_sync);
    REQUIRE(!pfs_poisoned(store));
    REQUIRE(driver()->create_dir("/after-failed-finish") == 0);
    REQUIRE(vfs_packed_finish_import() == 0); clean(); ++lifecycle_cases;
    puts("PASS postcommit NOSPC/IO preserve success and data; retry/remount and import publication recover");
}
enum operation { WRITE, RENAME_FILE, DELETE_FILE, ATTR_FILE, MKDIR };
static int change(enum operation op) {
    switch (op) {
    case WRITE: return (int)pfs_replace(store, "/saved", new_data, 2048, other_meta);
    case RENAME_FILE: return pfs_rename(store, "/saved", "/moved");
    case DELETE_FILE: return pfs_remove(store, "/saved", false);
    case ATTR_FILE: return pfs_setattr(store, "/saved", other_meta);
    case MKDIR: return pfs_mkdir(store, "/folder");
    }
    REQUIRE(0); return -1;
}
static unsigned valid_state(enum operation op) {
    pfs_info_t a, b;
    int r = pfs_stat(store, "/saved", &a);
    if (op == RENAME_FILE) {
        int m = pfs_stat(store, "/moved", &b);
        REQUIRE((r == 0 && m == LFS_ERR_NOENT) || (r == LFS_ERR_NOENT && m == 0));
        expect_file(r == 0 ? "/saved" : "/moved", old_data, meta);
        return r != 0;
    }
    if (op == DELETE_FILE) {
        REQUIRE(r == 0 || r == LFS_ERR_NOENT);
        if (!r) expect_file("/saved", old_data, meta);
        return r != 0;
    }
    REQUIRE(r == 0);
    if (op == WRITE) {
        REQUIRE(driver()->read_file_data("/saved", check, sizeof(check)) == 2048);
        bool newer = !memcmp(check, new_data, 2048);
        REQUIRE(newer || !memcmp(check, old_data, 2048));
        REQUIRE(!memcmp(a.meta, newer ? other_meta : meta, 128));
        return newer;
    }
    if (op == ATTR_FILE) {
        bool newer = !memcmp(a.meta, other_meta, 128);
        REQUIRE(newer || !memcmp(a.meta, meta, 128));
        expect_file("/saved", old_data, newer ? other_meta : meta);
        return newer;
    }
    expect_file("/saved", old_data, meta);
    r = pfs_stat(store, "/folder", &b);
    REQUIRE(r == LFS_ERR_NOENT || (r == 0 && b.type == PFS_DIR));
    return r == 0;
}
static void crash_ram(void) {
    for (unsigned i = 0; i < 128; ++i)
        if (owners[i]) mui_mem_free(owners[i]);
    store = NULL; vfs_persist_unmounted(driver()); REQUIRE(live == 0);
}
static void power_and_io(void) {
    for (volatile enum operation op = WRITE; op <= MKDIR; ++op) {
        restart_case(); REQUIRE(change(op) >= 0);
        unsigned events = media.stats.event_count, reads = read_calls;
        unsigned after_commit = publish_event, after_commit_read = publish_read;
        REQUIRE(events > after_commit && after_commit > 0 && events < 1000);
        REQUIRE(reads > after_commit_read && reads < 1000);
        for (volatile unsigned mode = NOR_CUT_AFTER; mode <= NOR_RETURN_IO_BEFORE; ++mode) {
            for (volatile unsigned nth = 1; nth <= events; ++nth) {
                restart_case(); jmp_buf jump;
                volatile bool success = false;
                if (!setjmp(jump)) {
                    nor_arm(&media, (enum nor_fault_mode)mode, nth, &jump);
                    int r = change(op);
                    REQUIRE(mode == NOR_RETURN_IO_BEFORE);
                    success = r >= 0;
                    if (published) REQUIRE(success && pfs_poisoned(store));
                    else REQUIRE(!success);
                }
                REQUIRE(media.fault_triggered);
                nor_disarm(&media); crash_ram();
                REQUIRE(driver()->mount() == 0);
                unsigned newer = valid_state(op);
                if (success || nth > after_commit) REQUIRE(newer);
                if (nth > after_commit) ++cleanup_crashes;
                ++crash_cases;
            }
        }
        /* Read faults include the post-publication scan and deletion reads. */
        for (unsigned nth = 1; nth <= reads; ++nth) {
            restart_case(); read_fail_at = nth;
            int r = change(op);
            REQUIRE(read_calls >= nth);
            if (published) REQUIRE(r >= 0 && pfs_poisoned(store));
            else REQUIRE(r < 0);
            bool success = r >= 0;
            read_fail_at = 0; crash_ram(); REQUIRE(driver()->mount() == 0);
            unsigned newer = valid_state(op);
            if (success) REQUIRE(newer);
            ++read_fault_cases;
        }
    }
    puts("PASS all write/rename/delete/raw128/mkdir NOR cut/torn/IO points and physical read faults");
}
int main(void) {
    for (unsigned i = 0; i < 2048; ++i) {
        old_data[i] = (uint8_t)(i * 7 + 3); new_data[i] = (uint8_t)(i * 13 + 5);
    }
    for (unsigned i = 0; i < 128; ++i) {
        meta[i] = (uint8_t)(i * 9 + 17); other_meta[i] = (uint8_t)(i * 11 + 19);
    }
    baseline(); immediate(); snapshots(); readonly_mount(); maintenance_failure(); power_and_io();
    drop(); REQUIRE(live == 0);
    printf("{\"passed\":true,\"lifecycleCases\":%u,\"readonlyCases\":%u,"
           "\"maintenanceFailureCases\":%u,\"norFaultCases\":%u,\"postcommitNorFaultCases\":%u,"
           "\"readFaultCases\":%u,\"pointerBytes\":%zu,\"pfsBytes\":%zu,"
           "\"peakRequestedHeap\":%zu,\"liveAtEnd\":%zu}\n",
           lifecycle_cases, readonly_cases, successful_cleanup_faults, crash_cases,
           cleanup_crashes, read_fault_cases, sizeof(void *), sizeof(pfs_t), peak, live);
    puts("PASS durable publication and automatic safe reclamation");
    return 0;
}
