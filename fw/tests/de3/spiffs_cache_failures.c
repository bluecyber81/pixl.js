#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <stddef.h>
#include <stdalign.h>
#include "spiffs.h"
#include "spiffs_nucleus.h"

/* Synthetic RAM-backed NOR only. Link the actual SPIFFS source/config. */
static spiffs fs;
static uint8_t flash[4096];
static alignas(max_align_t) uint8_t cache_bytes[(256+32)*4];
static unsigned reads, writes, read_faults, write_faults, partial;
enum { FAULT = -12345, ADDRESS = 512, LENGTH = 32 };

static s32_t hal_read(u32_t addr, u32_t len, u8_t *dst) {
    assert(addr <= sizeof flash && len <= sizeof flash - addr);
    reads++;
    if (read_faults) {
        read_faults--;
        memcpy(dst, flash + addr, partial < len ? partial : len);
        return FAULT;
    }
    memcpy(dst, flash + addr, len);
    return SPIFFS_OK;
}
static s32_t hal_write(u32_t addr, u32_t len, u8_t *src) {
    assert(addr <= sizeof flash && len <= sizeof flash - addr);
    writes++;
    u32_t n = write_faults ? (partial < len ? partial : len) : len;
    for (u32_t i = 0; i < n; i++) flash[addr+i] &= src[i];
    if (write_faults) { write_faults--; return FAULT; }
    return SPIFFS_OK;
}
static void setup(void) {
    memset(&fs, 0, sizeof fs);
    memset(flash, 0xff, sizeof flash);
    fs.cfg.phys_size = sizeof flash;
    fs.cfg.phys_addr = 0;
    fs.cfg.phys_erase_block = 4096;
    fs.cfg.log_block_size = 4096;
    fs.cfg.log_page_size = 256;
    fs.cfg.hal_read_f = hal_read;
    fs.cfg.hal_write_f = hal_write;
    fs.cache = cache_bytes;
    fs.cache_size = sizeof cache_bytes;
    spiffs_cache_init(&fs);
    reads = writes = read_faults = write_faults = partial = 0;
}
static s32_t read_bytes(uint8_t *out, uint8_t type) {
    return spiffs_phys_rd(&fs, type | SPIFFS_OP_C_READ, 0, ADDRESS, LENGTH, out);
}
static void failed_read(unsigned copied, unsigned failures) {
    uint8_t out[LENGTH]; setup(); partial = copied; read_faults = failures;
    s32_t first = read_bytes(out, SPIFFS_OP_T_OBJ_IX);
    s32_t second = read_bytes(out, SPIFFS_OP_T_OBJ_LU2);
    int matches = !memcmp(out, flash + ADDRESS, LENGTH);
    printf("read copied=%u failures=%u first=%ld second=%ld HAL_reads=%u matches_flash=%d\n",
           copied, failures, (long)first, (long)second, reads, matches);
    assert(first == FAULT);
    assert(reads == 2);
    assert(second == (failures > 1 ? FAULT : SPIFFS_OK));
    if (second == SPIFFS_OK) assert(matches);
}
static void failed_write(unsigned copied) {
    uint8_t out[LENGTH], input[LENGTH]; setup(); memset(input, 0x41, sizeof input);
    assert(read_bytes(out, SPIFFS_OP_T_OBJ_IX) == SPIFFS_OK);
    partial = copied; write_faults = 1;
    s32_t result = spiffs_phys_wr(&fs, SPIFFS_OP_T_OBJ_IX | SPIFFS_OP_C_UPDT,
                                0, ADDRESS, LENGTH, input);
    s32_t after = read_bytes(out, SPIFFS_OP_T_OBJ_LU2);
    int matches = !memcmp(out, flash + ADDRESS, LENGTH);
    printf("write copied=%u write_result=%ld read_result=%ld HAL_reads=%u HAL_writes=%u matches_flash=%d\n",
           copied, (long)result, (long)after, reads, writes, matches);
    assert(result == FAULT && after == SPIFFS_OK && writes == 1);
    assert(reads == 2 && matches);
}
static void unaffected_paths(void) {
    uint8_t out[LENGTH], input[LENGTH]; memset(input, 0x41, sizeof input);
    setup(); read_faults = 1; partial = 8;
    assert(read_bytes(out, SPIFFS_OP_T_OBJ_LU2) == FAULT);
    assert(read_bytes(out, SPIFFS_OP_T_OBJ_LU2) == SPIFFS_OK && reads == 2);
    assert(!memcmp(out, flash + ADDRESS, LENGTH));
    setup();
    assert(read_bytes(out, SPIFFS_OP_T_OBJ_IX) == SPIFFS_OK);
    assert(read_bytes(out, SPIFFS_OP_T_OBJ_IX) == SPIFFS_OK && reads == 1);
    assert(spiffs_phys_wr(&fs, SPIFFS_OP_T_OBJ_IX | SPIFFS_OP_C_UPDT,
                         0, ADDRESS, LENGTH, input) == SPIFFS_OK);
    assert(read_bytes(out, SPIFFS_OP_T_OBJ_LU2) == SPIFFS_OK && reads == 1);
    assert(!memcmp(out, flash + ADDRESS, LENGTH));
    setup();
    assert(read_bytes(out, SPIFFS_OP_T_OBJ_IX) == SPIFFS_OK);
    write_faults = 1; partial = 8;
    assert(spiffs_phys_wr(&fs, SPIFFS_OP_T_OBJ_IX | SPIFFS_OP_C_DELE,
                         0, ADDRESS, LENGTH, input) == FAULT);
    assert(read_bytes(out, SPIFFS_OP_T_OBJ_LU2) == SPIFFS_OK && reads == 2);
    assert(!memcmp(out, flash + ADDRESS, LENGTH));
    puts("PASS controls: uncached LU2 retry, successful cached read/write, delete invalidation");
}
int main(void) {
    failed_read(0, 1); failed_read(8, 1); failed_read(8, 2);
    failed_write(0); failed_write(8); unaffected_paths();
    puts("PASS cache rejects stale data after read/write failure");
    return 0;
}
