#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "spiffs.h"
#include "spiffs_nucleus.h"
#include "vfs.h"
#include "vfs_spiffs_diag.h"

#define TARGET "/amiibo/Animal/Welcome/W43 - Sprocket.bin"
#define ALIAS "/amiibo/Animal/Welcome/W41 - Sprocket.bin"
#define DIR "/amiibo/Animal/Welcome/"
static spiffs fs;
static uint8_t flash[65536], work[512], fds[128], cache[1152];
static uint32_t hal_reads, writes, erases;
static int no_writes, read_fail, triple_mode;
static unsigned triple_calls;
static uint32_t target_address;
static uint16_t u16(const uint8_t *p) { return p[0] | (uint16_t)p[1] << 8; }
static uint32_t u32(const uint8_t *p) { return p[0] | (uint32_t)p[1] << 8 | (uint32_t)p[2] << 16 | (uint32_t)p[3] << 24; }
uint32_t hal_spi_flash_read(uint32_t addr, void *buf, size_t size) {
    assert(addr <= sizeof(flash) && size <= sizeof(flash) - addr); ++hal_reads;
    if (read_fail) return 13;
    if (triple_mode) {
        assert(addr == target_address && size == sizeof(spiffs_page_object_ix_header));
        unsigned n = triple_calls++;
        if (n == 1) { memset(buf, 0xa5, size); return 12; }
        memcpy(buf, flash + addr, size);
        if (n == 2) ((spiffs_page_object_ix_header *)buf)->name[strlen("/amiibo/Animal/Welcome/W4")] ^= 2;
        return 0;
    }
    memcpy(buf, flash + addr, size); return 0;
}
static s32_t write_flash(u32_t addr, u32_t len, u8_t *src) {
    assert(!no_writes && addr + len <= sizeof(flash)); ++writes;
    for (unsigned i = 0; i < len; ++i) flash[addr + i] &= src[i]; return 0;
}
static s32_t erase_flash(u32_t addr, u32_t len) {
    assert(!no_writes && addr + len <= sizeof(flash)); ++erases; memset(flash + addr, 255, len); return 0;
}
static int32_t vfs_check_file_path(const char *path) { return strlen(path) < 64 ? VFS_OK : VFS_ERR_MAXNM; }
#define NRF_SUCCESS 0
/* ACTUAL_VFS_FUNCTIONS */

static void mount_fs(void) {
    spiffs_config cfg = {0}; cfg.phys_size = sizeof(flash); cfg.phys_addr = 0;
    cfg.log_page_size = 256; cfg.log_block_size = cfg.phys_erase_block = 4096;
    cfg.hal_read_f = spiffs_block_read; cfg.hal_write_f = write_flash; cfg.hal_erase_f = erase_flash;
    assert(SPIFFS_mount(&fs, &cfg, work, fds, sizeof(fds), cache, sizeof(cache), NULL) == 0);
}
static void observe(struct spiffs_dirent *found) {
    spiffs_DIR dir; struct spiffs_dirent ent;
    uint32_t before = hal_reads;
    vfs_spiffs_diag_list_begin(DIR); assert(hal_reads == before);
    assert(SPIFFS_opendir(&fs, "/", &dir)); SPIFFS_clearerr(&fs);
    while (SPIFFS_readdir(&dir, &ent)) {
        before = hal_reads;
        vfs_spiffs_diag_list_entry(DIR, &ent); assert(hal_reads == before);
        if (!strcmp((char *)ent.name, TARGET)) *found = ent;
    }
    before = hal_reads; vfs_spiffs_diag_list_end(DIR, SPIFFS_errno(&fs)); assert(hal_reads == before);
    assert(SPIFFS_closedir(&dir) == 0);
}
static uint8_t out[243];
static size_t length;
static void query(uint8_t op, uint8_t index) {
    spiffs before_fs = fs; uint8_t before_cache[sizeof(cache)], before_fds[sizeof(fds)], before_work[sizeof(work)];
    memcpy(before_cache, cache, sizeof(cache)); memcpy(before_fds, fds, sizeof(fds)); memcpy(before_work, work, sizeof(work));
    uint32_t r = hal_reads, w = writes, e = erases;
    memset(out, 0xa5, sizeof(out));
    assert(vfs_spiffs_diag_query(&fs, op, index, out, sizeof(out), &length) == VFS_OK);
    assert(length == (op == 0 ? 170 : op == 1 ? 91 : 235));
    for (size_t i = length; i < sizeof(out); ++i) assert(out[i] == 0xa5);
    assert(!memcmp(&before_fs, &fs, sizeof(fs)) && !memcmp(before_cache, cache, sizeof(cache)));
    assert(!memcmp(before_fds, fds, sizeof(fds)) && !memcmp(before_work, work, sizeof(work)));
    assert(writes == w && erases == e && hal_reads - r == (op == 2 ? 3 : 0));
}
int main(void) {
    memset(flash, 255, sizeof(flash)); mount_fs(); SPIFFS_unmount(&fs);
    assert(SPIFFS_format(&fs) == 0); mount_fs();
    uint8_t bytes[540]; memset(bytes, 0x57, sizeof(bytes));
    spiffs_file file = SPIFFS_open(&fs, TARGET, SPIFFS_CREAT | SPIFFS_WRONLY, 0); assert(file >= 0);
    assert(SPIFFS_write(&fs, file, bytes, sizeof(bytes)) == sizeof(bytes)); assert(SPIFFS_close(&fs, file) == 0);
    no_writes = 1; vfs_spiffs_diag_reset();
    query(0, 0); assert(!(out[3] & 1) && !out[6]);
    uint32_t before = hal_reads;
    assert(vfs_spiffs_diag_query(&fs, 1, 0, out, sizeof(out), &length) == VFS_ERR_NOOBJ && !length && hal_reads == before);
    struct spiffs_dirent ent; memset(&ent, 0, sizeof(ent)); observe(&ent);
    assert(ent.pix); target_address = ent.pix * 256u;
    query(0, 0); assert((out[3] & 3) == 3 && out[6] == 1 && out[7] == 1);
    assert(u16(out + 8) == ent.obj_id && u16(out + 10) == ent.pix && u32(out + 12) == target_address);
    assert(!memcmp(out + 104, ent.name, 64)); uint16_t generation = u16(out + 4);
    puts("PASS observations: no diagnostic HAL reads; exact target scope, source object/page/name and completed-list generation");

    uint8_t page[256];
    assert(spiffs_phys_rd(&fs, SPIFFS_OP_T_OBJ_IX | SPIFFS_OP_C_READ, 0, target_address, 256, page) == 0);
    query(1, 0); assert(out[3] & 32); assert(!strcmp((char *)out + 27, TARGET));
    triple_mode = 1; triple_calls = 0; query(2, 0); triple_mode = 0;
    assert(triple_calls == 3 && u32(out + 16) == 0 && !strcmp((char *)out + 25, TARGET));
    assert(u32(out + 89) == 12); for (unsigned i = 93; i < 162; ++i) assert(out[i] == 0);
    assert(u32(out + 162) == 0 && !strcmp((char *)out + 171, ALIAS));
    puts("PASS cache and triple direct reads: immutable fs/cache/LRU/FD/work; each HAL result retained, partial failure bytes zeroed, changed raw name visible");

    before = hal_reads;
    for (unsigned cap = 0; cap < 235; ++cap) assert(vfs_spiffs_diag_query(&fs, 2, 0, out, cap, &length) < 0 && !length);
    assert(vfs_spiffs_diag_query(&fs, 7, 0, out, sizeof(out), &length) < 0);
    assert(vfs_spiffs_diag_query(&fs, 2, 2, out, sizeof(out), &length) < 0);
    assert(vfs_spiffs_diag_query(NULL, 0, 0, out, sizeof(out), &length) < 0);
    assert(hal_reads == before);
    puts("PASS operation/index/capacity rejection: no arbitrary addresses, no HAL access");

    vfs_spiffs_diag_list_begin(DIR);
    struct spiffs_dirent bad = ent; memset(bad.name, 'X', 64); vfs_spiffs_diag_list_entry(DIR, &bad);
    strcpy((char *)bad.name, "/other/W43 - Sprocket.bin"); vfs_spiffs_diag_list_entry(DIR, &bad);
    strcpy((char *)bad.name, "/amiibo/Animal/Welcome/sub/W43 - Sprocket.bin"); vfs_spiffs_diag_list_entry(DIR, &bad);
    vfs_spiffs_diag_list_entry("/other/", &ent); query(0, 0); assert(!out[6]);
    vfs_spiffs_diag_list_entry(DIR, &ent); bad = ent; strcpy((char *)bad.name, ALIAS);
    vfs_spiffs_diag_list_entry(DIR, &bad); vfs_spiffs_diag_list_entry(DIR, &ent);
    vfs_spiffs_diag_list_end(DIR, SPIFFS_ERR_INTERNAL);
    query(0, 1); assert(out[6] == 2 && out[7] == 3 && (out[3] & 4)); assert((int32_t)u32(out + 16) == SPIFFS_ERR_INTERNAL);
    assert(u16(out + 4) != generation && !strcmp((char *)out + 104, ALIAS));
    puts("PASS bounded candidate list, malformed/wrong-context rejection, duplicates/truncation and list errors");

    vfs_spiffs_diag_list_begin(DIR); bad = ent; bad.pix = 0; vfs_spiffs_diag_list_entry(DIR, &bad);
    before = hal_reads; assert(vfs_spiffs_diag_query(&fs, 2, 0, out, sizeof(out), &length) < 0 && hal_reads == before);
    vfs_spiffs_diag_list_begin(DIR); bad.pix = UINT16_MAX; vfs_spiffs_diag_list_entry(DIR, &bad);
    assert(vfs_spiffs_diag_query(&fs, 2, 0, out, sizeof(out), &length) < 0 && hal_reads == before);
    observe(&ent);
    for (unsigned i = 1; i < 8; ++i) assert(spiffs_phys_rd(&fs, SPIFFS_OP_T_OBJ_IX | SPIFFS_OP_C_READ, 0, i * 256u, 256, page) == 0);
    read_fail = 1; vfs_file_t fd;
    assert(vfs_spiffs_open_file(ALIAS, &fd, SPIFFS_RDONLY) < 0); read_fail = 0;
    query(0, 0); assert((out[3] & 24) == 24 && (int32_t)u32(out + 20) == SPIFFS_ERR_INTERNAL);
    assert((int32_t)u32(out + 24) == SPIFFS_ERR_INTERNAL && u32(out + 28) == 13 && u32(out + 36) > 0);
    assert(!strcmp((char *)out + 40, ALIAS) && u16(out + 168) == u16(out + 4));
    vfs_spiffs_diag_list_begin(DIR); query(0, 0); assert(u16(out + 168) != u16(out + 4) && !(out[3] & 1));
    puts("PASS exact OPEN/HAL errors before mapping and explicit stale observation generation; invalid pages never read");
    vfs_spiffs_diag_reset(); SPIFFS_unmount(&fs);
    before = hal_reads; assert(vfs_spiffs_diag_query(&fs, 0, 0, out, sizeof(out), &length) == VFS_ERR_NODEV && hal_reads == before);
    puts("PASS no writes, erases, repairs or cache invalidations by diagnostic; unmounted storage rejected");
    return 0;
}
