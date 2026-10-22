/* Synthetic old-allocator placement. Production SPIFFS and NOR HAL model. */
#define main integration_fixture_main
#include "spiffs_integration.c"
#undef main

static unsigned repairs;
static int writes_before_failure = -1;
static int32_t fault_write(uint32_t addr, uint32_t len, uint8_t *data) {
    if (writes_before_failure == 0) return SPIFFS_ERR_INTERNAL;
    if (writes_before_failure > 0) --writes_before_failure;
    return write_flash(addr, len, data);
}
static int32_t fault_read(uint32_t addr, uint32_t len, uint8_t *data) {
    (void)addr; (void)len; (void)data; return SPIFFS_ERR_INTERNAL;
}
static void check_callback(spiffs_check_type type, spiffs_check_report report, u32_t a, u32_t b) {
    (void)type; (void)a; (void)b;
    if (report == SPIFFS_CHECK_FIX_INDEX) assert(++repairs < 8);
}
static void check_legacy(void) {
    unsigned char data[16];
    spiffs_file f = SPIFFS_open(&fs, "/legacy.bin", SPIFFS_RDONLY, 0); assert(f >= 0);
    assert(SPIFFS_read(&fs, f, data, sizeof(data)) == sizeof(data));
    for (unsigned i = 0; i < sizeof(data); i++) assert(data[i] == 0x3c);
    assert(SPIFFS_close(&fs, f) == 0);
}
static void seed(int index_header) {
    assert(mount_fs() == 0); SPIFFS_unmount(&fs); assert(SPIFFS_format(&fs) == 0);
    assert(mount_fs() == 0); save(0, 0);
    unsigned char data[16]; memset(data, 0x3c, sizeof(data));
    spiffs_file f = SPIFFS_open(&fs, "/legacy.bin", SPIFFS_CREAT | SPIFFS_WRONLY, 0); assert(f >= 0);
    assert(SPIFFS_write(&fs, f, data, sizeof(data)) == sizeof(data)); assert(SPIFFS_close(&fs, f) == 0);
    spiffs_stat st; assert(SPIFFS_stat(&fs, "/legacy.bin", &st) == 0);
    uint32_t table = (uint32_t)st.pix * 256u + sizeof(spiffs_page_object_ix_header);
    spiffs_page_ix old = index_header ? st.pix : spiffs_page_index_read(flash + table, 0);
    spiffs_page_header hdr; memcpy(&hdr, flash + (uint32_t)old * 256u, sizeof(hdr));
    SPIFFS_unmount(&fs);
    /* Byte-identical placement used by the old allocator, without changing format. */
    memcpy(flash + capacity - 256u, flash + (uint32_t)old * 256u, 256);
    uint32_t old_lu = (old / 16u) * 4096u + (old % 16u - 1u) * 2u;
    memset(flash + old_lu, 0, 2);
    flash[(uint32_t)old * 256u + offsetof(spiffs_page_header, flags)] &= (uint8_t)~SPIFFS_PH_FLAG_DELET;
    memcpy(flash + capacity - 4096u + 14u * 2u, &hdr.obj_id, sizeof(hdr.obj_id));
    if (!index_header) spiffs_page_index_write(flash + table, 0, (spiffs_page_ix)-1);
}
static void mount_check(void) {
    assert(mount_fs() == 0); fs.check_cb_f = check_callback; repairs = 0; check(0, 0);
}
int main(int argc, char **argv) {
    capacity = 16u * 1024u * 1024u; flash = malloc(capacity); assert(flash);
    memset(flash, 255, capacity);
    if (argc == 2) {
        image_io(argv[1], 0); mount_check();
        assert(SPIFFS_check(&fs) == 0); check(0, 0); check_legacy();
        puts("PASS real DE3.2 allocator image: terminating repair and both files preserved");
    } else {
        seed(0); uint8_t *original = malloc(capacity); assert(original); memcpy(original, flash, capacity);
        mount_check(); unsigned before_repair = writes;
        assert(SPIFFS_check(&fs) == 0); unsigned repair_writes = writes - before_repair;
        assert(repair_writes > 0 && repair_writes < 64);
        assert(repairs == 1); check(0, 0); check_legacy();
        SPIFFS_unmount(&fs); assert(mount_fs() == 0); check(0, 0); check_legacy(); SPIFFS_unmount(&fs);
        puts("PASS sentinel data recovered once, normal and recovered files survive remount");
        for (int failure = 0; (unsigned)failure <= repair_writes; failure++) {
            memcpy(flash, original, capacity); mount_check();
            writes_before_failure = failure; fs.cfg.hal_write_f = fault_write;
            int result = SPIFFS_check(&fs);
            assert(result == ((unsigned)failure < repair_writes ? SPIFFS_ERR_INTERNAL : 0));
            fs.cfg.hal_write_f = write_flash; writes_before_failure = -1;
            SPIFFS_unmount(&fs); mount_check();
            assert(SPIFFS_check(&fs) == 0); check(0, 0); check_legacy(); SPIFFS_unmount(&fs);
        }
        printf("PASS all %u repair write-failure cut points propagate errors and recover without losing either file\n", repair_writes);
        memcpy(flash, original, capacity); mount_check(); fs.cfg.hal_read_f = fault_read;
        assert(SPIFFS_check(&fs) == SPIFFS_ERR_INTERNAL); fs.cfg.hal_read_f = read_flash;
        SPIFFS_unmount(&fs); assert(!memcmp(flash, original, capacity));
        puts("PASS first-phase read error propagated with flash unchanged");
        memset(flash, 255, capacity); seed(1); memcpy(original, flash, capacity); mount_check();
        assert(SPIFFS_check(&fs) == SPIFFS_ERR_INDEX_FREE); check(0, 0);
        SPIFFS_unmount(&fs); assert(!memcmp(flash, original, capacity));
        puts("PASS sentinel index header returns bounded error, entire image and good file preserved");
        free(original);
    }
    free(flash); return 0;
}
