/* Real SPIFFS/config; only NOR storage and a failed lookup read are modelled. */
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "spiffs.h"
#include "spiffs_nucleus.h"
#define CHECK(c) do { if (!(c)) { fprintf(stderr, "FAIL %d: %s\n", __LINE__, #c); exit(1); } } while (0)
#define CAPACITY (2u * 1024u * 1024u)
#define GUARD UINT64_C(0xa1b2c3d4e5f67890)
static spiffs fs;
static uint8_t flash[CAPACITY];
static struct { uint64_t a; uint8_t bytes[512]; uint64_t z; } work_buf;
static struct { uint64_t a; uint8_t bytes[128]; uint64_t z; } fd_buf;
static struct { uint64_t a; uint8_t bytes[1152]; uint64_t z; } cache_buf;
static unsigned programs, erases, failed_reads;
static int readonly_phase;
static uint32_t fail_address = UINT32_MAX;
static int32_t hal_read(uint32_t addr, uint32_t len, uint8_t *dst) {
    CHECK(addr <= CAPACITY && len <= CAPACITY - addr);
    if (addr <= fail_address && fail_address - addr < len) {
        failed_reads++; return SPIFFS_ERR_INTERNAL;
    }
    memcpy(dst, flash + addr, len); return SPIFFS_OK;
}
static int32_t hal_write(uint32_t addr, uint32_t len, uint8_t *src) {
    CHECK(!readonly_phase && addr <= CAPACITY && len <= CAPACITY - addr);
    programs++; for (uint32_t i = 0; i < len; i++) flash[addr + i] &= src[i];
    return SPIFFS_OK;
}
static int32_t hal_erase(uint32_t addr, uint32_t len) {
    CHECK(!readonly_phase && !(addr & 4095u) && len == 4096 && addr <= CAPACITY - len);
    erases++; memset(flash + addr, 255, len); return SPIFFS_OK;
}
static void guards(void) {
    CHECK(work_buf.a == GUARD && work_buf.z == GUARD);
    CHECK(fd_buf.a == GUARD && fd_buf.z == GUARD);
    CHECK(cache_buf.a == GUARD && cache_buf.z == GUARD);
}
static void mount_fs(void) {
    spiffs_config cfg = {0};
    cfg.phys_size = CAPACITY; cfg.phys_erase_block = 4096;
    cfg.log_block_size = 4096; cfg.log_page_size = 256;
    cfg.hal_read_f = hal_read; cfg.hal_write_f = hal_write; cfg.hal_erase_f = hal_erase;
    work_buf.a = work_buf.z = fd_buf.a = fd_buf.z = cache_buf.a = cache_buf.z = GUARD;
    CHECK(SPIFFS_mount(&fs, &cfg, work_buf.bytes, fd_buf.bytes, sizeof(fd_buf.bytes),
                       cache_buf.bytes, sizeof(cache_buf.bytes), NULL) == SPIFFS_OK);
    guards();
}
int main(int argc, char **argv) {
    CHECK(argc == 2);
    memset(flash, 255, sizeof(flash)); mount_fs(); SPIFFS_unmount(&fs);
    CHECK(SPIFFS_format(&fs) == SPIFFS_OK); mount_fs(); readonly_phase = 1;
    uint8_t page[256];
    for (unsigned i = 1; i <= 8; i++)
        CHECK(spiffs_phys_rd(&fs, SPIFFS_OP_T_OBJ_IX | SPIFFS_OP_C_READ,
                            0, i * 256u, 256, page) == SPIFFS_OK);
    spiffs_DIR dir; struct spiffs_dirent ent;
    CHECK(SPIFFS_opendir(&fs, "/", &dir));
    int normal = !strcmp(argv[1], "normal_end");
    CHECK(normal || !strcmp(argv[1], "previous_block") || !strcmp(argv[1], "last_block"));
    dir.block = fs.block_count - (!strcmp(argv[1], "previous_block") ? 2 : 1); dir.entry = 0;
    if (!normal) fail_address = SPIFFS_BLOCK_TO_PADDR(&fs, dir.block);
    unsigned p = programs, e = erases;
    SPIFFS_clearerr(&fs); CHECK(SPIFFS_readdir(&dir, &ent) == NULL);
    int got = SPIFFS_errno(&fs), expected = normal ? SPIFFS_OK : SPIFFS_ERR_INTERNAL;
    CHECK(failed_reads == (normal ? 0u : 1u)); CHECK(programs == p && erases == e); guards();
    CHECK(SPIFFS_closedir(&dir) == SPIFFS_OK); SPIFFS_unmount(&fs);
    printf("scenario=%s expected_errno=%d actual_errno=%d HAL_failures=%u\n", argv[1], expected, got, failed_reads);
    CHECK(got == expected);
    puts("PASS EOF/error distinction; no writes during directory read"); return 0;
}
