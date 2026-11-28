/* Actual PackedFS/VFS/protocol/df_core, synthetic NOR and transport only. */
#define main persistence_fixture_main
#include CONTRACT
#undef main
#include "mbedtls/sha256.h"
static unsigned hash_calls, hash_fail_at;
static int checked_sha256(const unsigned char *p, size_t n, unsigned char out[32], int is224);
#define mbedtls_sha256_ret checked_sha256
#include PROTOCOL
#undef mbedtls_sha256_ret
#include CORE

static df_frame_t replies[256];
static unsigned reply_count, tx_fail_at, aborts, vfs_errors;
static size_t payload_capacity = DF_PAYLOAD_LEN;
static df_event_handler_t event_handler;
static bool recovery_mode, drive_enabled = true, reset_reserved;
static vfs_driver_t *injected_driver;
static void (*timer_callback)(void *);
static void *timer_context;

void runtime_diag_vfs_error(uint8_t c, int32_t e) { (void)c; if (e) ++vfs_errors; }
void runtime_diag_mount_begin(void) {}
void runtime_diag_mount_configured(uint32_t ms) { (void)ms; }
void runtime_diag_mount_complete(int32_t r, uint32_t ms, uint8_t a, uint8_t b, uint16_t c) {
    (void)r; (void)ms; (void)a; (void)b; (void)c;
}
void runtime_diag_mount_cache(bool a, bool b) { (void)a; (void)b; }
void runtime_diag_mount_read(uint32_t n, bool ok) { (void)n; (void)ok; }
void runtime_diag_ble_abort(uint8_t cause) { (void)cause; }
bool ble_work_can_send(void) { return true; }
bool vfs_drive_enabled(vfs_drive_t d) { return drive_enabled && d == VFS_DRIVE_EXT; }
vfs_driver_t *vfs_get_driver(vfs_drive_t d) {
    REQUIRE(d == VFS_DRIVE_EXT); return injected_driver ? injected_driver : driver();
}
bool vfs_packed_recovery_required(void) { return recovery_mode; }
int32_t vfs_packed_layout(uint8_t d, uint8_t out[72]) { (void)d; (void)out; return VFS_ERR_UNSUPT; }
void vfs_packed_import_status(uint8_t d, uint8_t out[40]) { (void)d; memset(out, 0, 40); }
void ble_disable(void) {}
bool system_prepare_reset(void) { reset_reserved = true; return true; }
bool system_reset_prepared(void) { return reset_reserved; }
void system_cancel_reset(void) { reset_reserved = false; }
bool system_reboot(void) { reset_reserved = false; return true; }
void df_proto_info_cancel_pending(void) {}
const df_cmd_entry_t df_proto_handler_info_entries[] = {{0, NULL}};
size_t ble_nus_max_data_length(void) { return payload_capacity + DF_HEADER_LEN; }
static int32_t transport_init(df_event_handler_t cb) { event_handler = cb; return 0; }
static int32_t transport_send(df_frame_t *frame) {
    REQUIRE(reply_count < sizeof(replies) / sizeof(replies[0]));
    replies[reply_count++] = *frame;
    return reply_count == tx_fail_at ? -1 : 0;
}
static df_driver_t transport = {transport_init, transport_send};
df_driver_t *ble_get_df_driver(void) { return &transport; }
static void event(df_event_type_t type) { df_event_t e = {.type = type}; event_handler(&e); }
void ble_nus_abort_transfer(void) { ++aborts; event(DF_EVENT_LINK_DISCONNECTED); }
int app_timer_create(unsigned *id, unsigned mode, void (*cb)(void *)) {
    REQUIRE(mode == APP_TIMER_MODE_SINGLE_SHOT); *id = 1; timer_callback = cb; return 0;
}
int app_timer_start(unsigned id, unsigned ticks, void *ctx) {
    REQUIRE(id == 1 && ticks == 30000 && !timer_context); timer_context = ctx; return 0;
}
int app_timer_stop(unsigned id) { REQUIRE(id == 1); timer_context = NULL; return 0; }
void mbedtls_platform_zeroize(void *p, size_t n) { volatile uint8_t *q = p; while (n--) *q++ = 0; }
static int checked_sha256(const unsigned char *p, size_t n, unsigned char out[32], int is224) {
    if (++hash_calls == hash_fail_at) return -1;
    return mbedtls_sha256_ret(p, n, out, is224);
}

static const char *paths[4] = {"E:/a.bin", "E:/b.bin", "E:/c.bin", "E:/\xc3\xa4-\xe6\x96\x87.bin"};
static uint16_t sizes4[4];
static size_t baseline_live, max_read_allocation, max_digest_allocation;
static unsigned accepted, rejected, allocation_failures, io_failures, lifecycle_cases;
static void send_request(df_frame_t *f) {
    df_event_t e = {.type = DF_EVENT_DATA_RECEVIED, .df = f};
    event_handler(&e);
}
static void fresh(const uint16_t sizes_in[4]) {
    df_proto_vfs_cleanup();
    injected_driver = NULL; recovery_mode = false; drive_enabled = true;
    fail_at = read_fail_at = hash_fail_at = tx_fail_at = 0;
    reset_baseline();
    for (unsigned i = 0; i < 4; ++i) {
        sizes4[i] = sizes_in[i];
        REQUIRE(driver()->write_file_data(paths[i] + 2, new_data + 101 * i, sizes4[i]) == sizes4[i]);
    }
    baseline_live = live;
    payload_capacity = DF_PAYLOAD_LEN; reply_count = hash_calls = aborts = vfs_errors = 0;
    nor_reset_observation(&media);
}
static df_frame_t request(uint8_t mode, unsigned count) {
    df_frame_t f = {.cmd = DF_PROTO_CMD_VFS_BATCH_READ, .length = 10, .data = {mode, count}};
    uint64_t revision = vfs_packed_revision(); memcpy(f.data + 2, &revision, 8);
    for (unsigned i = 0; i < count; ++i) {
        uint16_t n = (uint16_t)strlen(paths[i]);
        REQUIRE((size_t)f.length + n + 4 <= DF_PAYLOAD_LEN);
        memcpy(f.data + f.length, &n, 2); f.length += 2;
        memcpy(f.data + f.length, paths[i], n); f.length += n;
        memcpy(f.data + f.length, &sizes4[i], 2); f.length += 2;
    }
    return f;
}
static void no_mutations(void) {
    REQUIRE(media.stats.programs == 0 && media.stats.erases == 0);
    REQUIRE(vfs_packed_handles_idle());
}
static void reject(df_frame_t *f) {
    reply_count = 0;
    send_request(f);
    REQUIRE(reply_count == 1 && replies[0].cmd == f->cmd && replies[0].status == DF_STATUS_ERR);
    REQUIRE(replies[0].length == 0 && replies[0].chunk == 0);
    REQUIRE(live == baseline_live && !small_read.bytes && df_proto_vfs_is_idle());
    no_mutations(); ++rejected;
}
static void finish(uint8_t command, const uint8_t *expected, size_t length) {
    size_t offset = 0;
    for (unsigned i = 0;; ++i) {
        REQUIRE(reply_count == i + 1);
        const df_frame_t *r = &replies[i];
        REQUIRE(r->cmd == command && !r->status && (r->chunk & 0x7fff) == i);
        REQUIRE(r->length <= payload_capacity && offset + r->length <= length);
        REQUIRE(!memcmp(r->data, expected + offset, r->length)); offset += r->length;
        if (!(r->chunk & 0x8000)) break;
        REQUIRE(offset < length && small_read.bytes && !df_proto_vfs_is_idle());
        REQUIRE(vfs_packed_handles_idle());
        event(DF_EVENT_DATA_TRANSMIT_READY);
    }
    REQUIRE(offset == length && live == baseline_live && !small_read.bytes && df_proto_vfs_is_idle());
    unsigned sent = reply_count; event(DF_EVENT_DATA_TRANSMIT_READY); REQUIRE(reply_count == sent);
    no_mutations(); ++accepted;
}
static void success_cases(void) {
    const uint16_t datasets[][4] = {{0, 0, 0, 0}, {0, 1, 540, 572}, {243, 244, 486, 572}, {572, 572, 572, 572}};
    const size_t capacities[] = {16, 20, 128, 243};
    for (unsigned set = 0; set < 4; ++set) for (unsigned mode = 0; mode < 2; ++mode)
        for (unsigned count = 1; count <= 4; ++count) for (unsigned mtu = 0; mtu < 4; ++mtu) {
            fresh(datasets[set]); payload_capacity = capacities[mtu];
            uint8_t expected[2288]; size_t total = 0;
            for (unsigned i = 0; i < count; ++i) {
                if (mode) { REQUIRE(!mbedtls_sha256_ret(new_data + i * 101, sizes4[i], expected + total, 0)); total += 32; }
                else { memcpy(expected + total, new_data + i * 101, sizes4[i]); total += sizes4[i]; }
            }
            uint64_t revision = vfs_packed_revision();
            df_frame_t f = request(mode, count); reply_count = 0; send_request(&f);
            if (small_read.bytes) {
                size_t reserved = live - baseline_live;
                REQUIRE(reserved <= (mode ? 701u : 2289u));
                size_t *maximum = mode ? &max_digest_allocation : &max_read_allocation;
                if (reserved > *maximum) *maximum = reserved;
            }
            finish(f.cmd, expected, total); REQUIRE(vfs_packed_revision() == revision);
        }
    puts("PASS batch READ/DIGEST1..4, empty/mixed/572, UTF8 paths, MTU16/20/128/243 and ordered exact results");
}
static void invalid_requests(void) {
    const uint16_t values[4] = {1, 2, 3, 4}; fresh(values);
    df_frame_t base = request(0, 4), f;
    for (unsigned n = 0; n < base.length; ++n) { f = base; f.length = n; reject(&f); }
    for (unsigned mode = 2; mode < 256; ++mode) { f = base; f.data[0] = mode; reject(&f); }
    const uint8_t counts[] = {0, 5, 255};
    for (unsigned i = 0; i < 3; ++i) { f = base; f.data[1] = counts[i]; reject(&f); }
    f = base; f.status = 1; reject(&f); f = base; f.chunk = 0x8000; reject(&f);
    f = base; f.length++; reject(&f); f = base; f.length = 244; reject(&f);
    f = base; memset(f.data + 2, 0, 8); reject(&f); f = base; f.data[2] ^= 1; reject(&f);
    f = base; f.data[10] = f.data[11] = 255; reject(&f);
    f = base; f.data[12] = 'I'; reject(&f); f = base; f.data[15] = 0; reject(&f);
    uint16_t size_offset = 12 + strlen(paths[0]);
    const uint16_t bad_sizes[] = {573, 65535};
    for (unsigned i = 0; i < 2; ++i) { f = base; memcpy(f.data + size_offset, &bad_sizes[i], 2); reject(&f); }
    unsigned reads_before = read_calls;
    f = base; f.data[f.length - 1] = 255; reject(&f); REQUIRE(read_calls == reads_before);
    const char *original = paths[0];
    const char *bad_paths[] = {"E:/", "E:/../x", "E:/./x", "E://x", "E:/x/", "E:/012345678901234567890123456789012345678901234567"};
    for (unsigned i = 0; i < sizeof(bad_paths) / sizeof(bad_paths[0]); ++i) {
        paths[0] = bad_paths[i]; f = request(0, 1); reject(&f);
    }
    paths[0] = original;
    recovery_mode = true; reject(&base); recovery_mode = false;
    drive_enabled = false; reject(&base); drive_enabled = true;
    store->poisoned = true; reject(&base); store->poisoned = false;
    puts("PASS complete preflight, truncation/trailing/oversize/count/mode/path/NUL/size and stale/recovery guards");
}
static void exact_request_and_path_bounds(void) {
    const uint16_t values[4] = {1, 2, 3, 4}; fresh(values);
    const char *original[4]; char names[4][67];
    REQUIRE(driver()->create_dir("/folder") == 0);
    for (unsigned i = 0; i < 4; ++i) {
        original[i] = paths[i]; strcpy(names[i], "E:/folder/");
        size_t n = i == 3 ? 55 : 54;
        memset(names[i] + 10, 'a' + i, n - 10); names[i][n] = 0; paths[i] = names[i];
        REQUIRE(driver()->write_file_data(paths[i] + 2, new_data + i * 101, values[i]) == values[i]);
    }
    baseline_live = live; nor_reset_observation(&media);
    df_frame_t f = request(0, 4); REQUIRE(f.length == 243);
    uint8_t expected[10]; size_t offset = 0;
    for (unsigned i = 0; i < 4; ++i) { memcpy(expected + offset, new_data + i * 101, values[i]); offset += values[i]; }
    reply_count = 0; send_request(&f); finish(f.cmd, expected, sizeof(expected));
    /* A 65-byte full path fits the existing66-byte C buffer;66 cannot. */
    char parent[32]; strcpy(parent, "/012345678901234567890123456789");
    REQUIRE(driver()->create_dir(parent) == 0);
    snprintf(names[0], sizeof(names[0]), "E:%s/0123456789012345678901234567890", parent);
    REQUIRE(strlen(names[0]) == 65);
    REQUIRE(driver()->write_file_data(names[0] + 2, new_data, 1) == 1);
    baseline_live = live; nor_reset_observation(&media);
    f = request(0, 1); reply_count = 0; send_request(&f); finish(f.cmd, new_data, 1);
    names[0][65] = 'x'; names[0][66] = 0; f = request(0, 1); reject(&f);
    for (unsigned i = 0; i < 4; ++i) paths[i] = original[i];
    puts("PASS exact243-byte request and full-path65/66-byte boundary with real files");
}
static unsigned file_reads, fail_file, mutate_file;
static int injected_kind;
static int32_t injected_read(const char *path, void *bytes, size_t capacity) {
    unsigned current = ++file_reads;
    if (current == fail_file && injected_kind == 0) return VFS_ERR_FAIL;
    int32_t result = driver()->read_file_data(path, bytes, capacity);
    if (current == fail_file && injected_kind == 1) return result - 1;
    if (current == fail_file && injected_kind == 2) return result + 1;
    if (current == mutate_file) {
        if (injected_kind == 4) ++mount_epoch; else recovery_mode = true;
    }
    return result;
}
static void error_cases(void) {
    const uint16_t values[4] = {540, 572, 0, 1};
    for (unsigned mode = 0; mode < 2; ++mode) {
        for (unsigned index = 1; index <= 4; ++index) for (int kind = 0; kind < 3; ++kind) {
            fresh(values); vfs_driver_t modified = *driver(); modified.read_file_data = injected_read;
            injected_driver = &modified; file_reads = 0; fail_file = index; mutate_file = 0; injected_kind = kind;
            df_frame_t f = request(mode, 4); reject(&f); REQUIRE(file_reads == index); injected_driver = NULL;
        }
        for (unsigned index = 1; index <= 4; ++index) {
            for (int kind = 3; kind <= 4; ++kind) {
                fresh(values); vfs_driver_t modified = *driver(); modified.read_file_data = injected_read;
                injected_driver = &modified; file_reads = 0; fail_file = 0; mutate_file = index; injected_kind = kind;
                df_frame_t f = request(mode, 4); reject(&f); injected_driver = NULL; recovery_mode = false;
            }
            fresh(values);
            sizes4[index - 1] = values[index - 1] ? values[index - 1] - 1 : 1;
            df_frame_t mismatched = request(mode, 4); reject(&mismatched);
            if (values[index - 1] && values[index - 1] < 572) {
                sizes4[index - 1] = values[index - 1] + 1;
                mismatched = request(mode, 4); reject(&mismatched);
            }
        }
        fresh(values); df_frame_t f = request(mode, 4);
        unsigned start_allocs = alloc_calls, start_reads = read_calls;
        send_request(&f);
        unsigned allocations = alloc_calls - start_allocs, reads = read_calls - start_reads;
        df_proto_vfs_cleanup(); REQUIRE(live == baseline_live);
        for (unsigned nth = 1; nth <= allocations; ++nth) {
            fresh(values); f = request(mode, 4); fail_at = alloc_calls + nth;
            reject(&f); REQUIRE(alloc_calls >= fail_at); fail_at = 0; ++allocation_failures;
        }
        for (unsigned nth = 1; nth <= reads; ++nth) {
            fresh(values); f = request(mode, 4); read_fail_at = read_calls + nth;
            reject(&f); REQUIRE(read_calls >= read_fail_at); read_fail_at = 0; ++io_failures;
        }
    }
    for (unsigned nth = 1; nth <= 4; ++nth) {
        fresh(values); hash_fail_at = nth; df_frame_t f = request(1, 4); reject(&f); hash_fail_at = 0;
    }
    puts("PASS all-or-error at each file, SHA errors, post-read recovery, every allocation and NOR-read failure");
}
static void busy_ownership(void) {
    const uint16_t values[4] = {1, 2, 3, 4}; fresh(values);
    df_frame_t f = {.cmd = DF_PROTO_CMD_VFS_FILE_OPEN};
    uint16_t n = strlen(paths[0]); memcpy(f.data, &n, 2); memcpy(f.data + 2, paths[0], n);
    f.data[n + 2] = VFS_MODE_READONLY; f.length = n + 3; send_request(&f);
    REQUIRE(file_chunk_state.opened && !replies[0].status);
    void *owned = file_chunk_state.vfs_fd.handle; size_t with_handle = live;
    f = request(0, 4); reply_count = 0; send_request(&f);
    REQUIRE(reply_count == 1 && replies[0].status == DF_STATUS_ERR && !replies[0].length);
    REQUIRE(file_chunk_state.vfs_fd.handle == owned && live == with_handle && !small_read.bytes);
    df_proto_vfs_cleanup(); REQUIRE(live == baseline_live);
    /* An external live handle is excluded by the revision guard as well. */
    vfs_dir_t directory = {0}; REQUIRE(!driver()->open_dir("/", &directory));
    with_handle = live; reply_count = 0; send_request(&f);
    REQUIRE(reply_count == 1 && replies[0].status == DF_STATUS_ERR && !replies[0].length);
    REQUIRE(directory.handle && live == with_handle && !small_read.bytes);
    REQUIRE(!driver()->close_dir(&directory) && live == baseline_live);
    REQUIRE(!driver()->create_dir("/~u12345678"));
    const char *staged = "E:/~u12345678/z.bin"; n = strlen(staged);
    f = (df_frame_t){.cmd = DF_PROTO_CMD_VFS_SMALL_CREATE, .length = 49 + n};
    uint32_t id = 7; uint64_t revision = vfs_packed_revision(); uint16_t size = 540;
    memcpy(f.data + 1, &id, 4); memcpy(f.data + 5, &revision, 8); memcpy(f.data + 13, &size, 2);
    REQUIRE(!mbedtls_sha256_ret(new_data, size, f.data + 15, 0));
    memcpy(f.data + 47, &n, 2); memcpy(f.data + 49, staged, n);
    reply_count = 0; send_request(&f); REQUIRE(!replies[0].status && df_small_create_pending());
    with_handle = live; f = request(1, 4); reply_count = 0; send_request(&f);
    REQUIRE(reply_count == 1 && replies[0].status == DF_STATUS_ERR && !replies[0].length);
    REQUIRE(df_small_create_pending() && live == with_handle && !small_read.bytes);
    df_proto_vfs_cleanup(); REQUIRE(live == baseline_live && !timer_context);
    puts("PASS existing reader/directory/pending-create ownership survives refused batch");
}
static void capability_and_lifecycle(void) {
    const uint16_t values[4] = {572, 572, 572, 572}; fresh(values);
    for (unsigned which = 0; which < 2; ++which) {
        df_frame_t cap = {.cmd = which ? DF_PROTO_CMD_VFS_BATCH_CAP : DF_PROTO_CMD_VFS_SMALL_CAP};
        reply_count = 0; send_request(&cap); REQUIRE(reply_count == 1);
        uint8_t expected[16] = {'P', 'X', which ? 'B' : 'S', which ? 'R' : 'C', 1, which ? 4 : 7, 0x3c, 2};
        uint64_t revision = vfs_packed_revision(); memcpy(expected + 8, &revision, 8);
        REQUIRE(!replies[0].status && replies[0].length == 16 && !memcmp(replies[0].data, expected, 16));
        cap.length = 1; reject(&cap); cap.length = 0; cap.status = 1; reject(&cap);
        cap.status = 0; cap.chunk = 1; reject(&cap);
    }
    for (unsigned mode = 0; mode < 2; ++mode) {
        for (unsigned cut = 1; cut <= (mode ? 8u : 143u); ++cut) {
            fresh(values); payload_capacity = 16; df_frame_t f = request(mode, 4); send_request(&f);
            for (unsigned i = 1; i < cut; ++i) event(DF_EVENT_DATA_TRANSMIT_READY);
            event(DF_EVENT_LINK_DISCONNECTED);
            REQUIRE(live == baseline_live && !small_read.bytes && df_proto_vfs_is_idle());
            unsigned sent = reply_count; event(DF_EVENT_DATA_TRANSMIT_READY); REQUIRE(reply_count == sent);
            no_mutations(); ++lifecycle_cases;
        }
        fresh(values); payload_capacity = 16; df_frame_t f = request(mode, 4); send_request(&f);
        df_frame_t replacement = {.cmd = 0x7f}; send_request(&replacement);
        REQUIRE(live == baseline_live && df_proto_vfs_is_idle() && replies[reply_count - 1].status == 255);
        unsigned sent = reply_count; event(DF_EVENT_DATA_TRANSMIT_READY); REQUIRE(reply_count == sent);
        fresh(values); payload_capacity = 16; f = request(mode, 4); tx_fail_at = 2; send_request(&f);
        event(DF_EVENT_DATA_TRANSMIT_READY); REQUIRE(aborts == 1 && live == baseline_live && df_proto_vfs_is_idle());
        fresh(values); payload_capacity = 0; f = request(mode, 4); reject(&f);
        lifecycle_cases += 3;
    }
    /* Legacy READ and SHA requests still return exactly their historical bytes. */
    fresh(values);
    for (unsigned digest = 0; digest < 2; ++digest) {
        uint16_t n = strlen(paths[0]);
        df_frame_t f = {.cmd = digest ? DF_PROTO_CMD_VFS_FILE_SHA256 : DF_PROTO_CMD_VFS_SMALL_READ, .length = n + 4};
        memcpy(f.data, &n, 2); memcpy(f.data + 2, paths[0], n); memcpy(f.data + 2 + n, &sizes4[0], 2);
        uint8_t expected[572]; size_t len = digest ? 32 : 572;
        if (digest) REQUIRE(!mbedtls_sha256_ret(new_data, 572, expected, 0)); else memcpy(expected, new_data, 572);
        reply_count = 0; send_request(&f); finish(f.cmd, expected, len);
    }
    puts("PASS unchanged PXSC/legacyREAD/SHA, replacement, each disconnect boundary, failed TX and no retained state");
}
#ifdef PIXL_GROUP_CREATE_ENABLE
#include "group_create_679.inc"
#include "guarded_create_683.inc"
#endif
int main(void) {
    for (unsigned i = 0; i < sizeof(new_data); ++i) { old_data[i] = (uint8_t)(7*i+3); new_data[i] = (uint8_t)(13*i+5); }
    for (unsigned i = 0; i < sizeof(meta); ++i) meta[i] = (uint8_t)(9*i+17);
    baseline(); df_core_init();
#ifdef PIXL_GROUP_CREATE_ENABLE
    group_contract();
    guarded_contract();
    guarded_storage_faults();
#endif
    success_cases(); invalid_requests(); exact_request_and_path_bounds(); error_cases(); busy_ownership(); capability_and_lifecycle();
    df_proto_vfs_cleanup(); drop(); REQUIRE(live == 0);
    printf("{\"passed\":true,\"accepted\":%u,\"rejected\":%u,\"allocationFailures\":%u,\"ioFailures\":%u,\"lifecycleCases\":%u,\"maxReadOwnedHeap\":%zu,\"maxDigestOwnedHeap\":%zu,\"liveAtEnd\":%zu,\"pointerBytes\":%zu}\n",
           accepted, rejected, allocation_failures, io_failures, lifecycle_cases, max_read_allocation, max_digest_allocation, live, sizeof(void *));
    return 0;
}
