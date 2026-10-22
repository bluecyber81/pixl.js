/* Actual SPIFFS/configuration; only the physical NOR callbacks are modelled. */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stddef.h>
#include "spiffs.h"
#include "spiffs_nucleus.h"

/* Avoid the Windows CRT assertion dialog in intentional negative controls. */
#define CHECK(expr) do { if (!(expr)) { \
  fprintf(stderr, "CHECK failed at line %d: %s\n", __LINE__, #expr); \
  exit(1); \
} } while (0)

static spiffs fs;
static uint8_t flash[65536];
static _Alignas(max_align_t) uint8_t work[512], fds[1024], cache[(256 + 32) * 4];
static unsigned erases, writes, reads, fail_call, partial, write_fail;

static s32_t read_flash(u32_t addr, u32_t len, u8_t *dst) {
  CHECK(addr <= sizeof flash && len <= sizeof flash - addr);
  reads++;
  memcpy(dst, flash + addr, len);
  return SPIFFS_OK;
}

static s32_t write_flash(u32_t addr, u32_t len, u8_t *src) {
  CHECK(addr <= sizeof flash && len <= sizeof flash - addr);
  CHECK(len <= 256u - addr % 256u);
  writes++;
  if (write_fail) return SPIFFS_ERR_INTERNAL;
  for (u32_t i = 0; i < len; i++) flash[addr + i] &= src[i];
  return SPIFFS_OK;
}

static s32_t erase_flash(u32_t addr, u32_t len) {
  CHECK(addr <= sizeof flash && len <= sizeof flash - addr);
  CHECK(len == 4096 && addr % 4096 == 0);
  erases++;
  if (erases == fail_call) {
    CHECK(partial <= len);
    memset(flash + addr, 255, partial);
    return SPIFFS_ERR_INTERNAL;
  }
  memset(flash + addr, 255, len);
  return SPIFFS_OK;
}

static u8_t cached_byte(u32_t addr) {
  u8_t value;
  CHECK(spiffs_phys_rd(&fs, SPIFFS_OP_T_OBJ_LU | SPIFFS_OP_C_READ,
                      0, addr, 1, &value) == SPIFFS_OK);
  return value;
}

static void setup(unsigned logical) {
  memset(flash, 255, sizeof flash);
  spiffs_config cfg = {0};
  cfg.phys_size = sizeof flash;
  cfg.phys_erase_block = 4096;
  cfg.log_block_size = logical;
  cfg.log_page_size = 256;
  cfg.hal_read_f = read_flash;
  cfg.hal_write_f = write_flash;
  cfg.hal_erase_f = erase_flash;
  CHECK(SPIFFS_mount(&fs, &cfg, work, fds, sizeof fds,
                     cache, sizeof cache, NULL) == SPIFFS_OK);
  CHECK(SPIFFS_CACHE == 1 && SPIFFS_CACHE_WR == 1);
  CHECK(SPIFFS_USE_MAGIC == 0 && SPIFFS_READ_ONLY == 0);
  memset(flash, 0xab, logical);
  spiffs_cache_init(&fs);
  fs.free_blocks = 7;
  fs.max_erase_count = 12;
  erases = writes = reads = 0;
}

static void check_gc(const char *scenario) {
  /* A fully deleted block is a valid quick-GC candidate. */
  memset(flash, 0, 4096);
  spiffs_cache_init(&fs);
  fs.stats_p_deleted = SPIFFS_PAGES_PER_BLOCK(&fs) - SPIFFS_OBJ_LOOKUP_PAGES(&fs);
  CHECK(cached_byte(0) == 0);
  CHECK(cached_byte(512) == 0);
  CHECK(cached_byte(2560) == 0);
  CHECK(cached_byte(4096) == 255); /* A different block must remain cached. */

  if (!strcmp(scenario, "gc_failure")) fail_call = 1;
  else if (!strcmp(scenario, "gc_partial")) { fail_call = 1; partial = 2048; }
  else if (!strcmp(scenario, "gc_metadata_failure")) write_fail = 1;
  else CHECK(!strcmp(scenario, "gc_success"));

  int failed = fail_call || write_fail;
  s32_t result = SPIFFS_gc_quick(&fs, 0);
  CHECK(result == (failed ? SPIFFS_ERR_INTERNAL : SPIFFS_OK));
  if (failed) CHECK(SPIFFS_errno(&fs) == SPIFFS_ERR_INTERNAL);
  CHECK(erases == 1);
  CHECK(writes == (fail_call ? 0u : 1u));
  CHECK(fs.free_blocks == (fail_call ? 7u : 8u));
  CHECK(fs.max_erase_count == (failed ? 12u : 13u));

  unsigned prior_reads = reads;
  CHECK(cached_byte(0) == flash[0]);
  CHECK(reads == prior_reads + 1); /* Never reuse a suspect block page. */
  CHECK(cached_byte(2560) == flash[2560]);
  CHECK(reads == prior_reads + 2);
  CHECK(cached_byte(4096) == 255);
  CHECK(reads == prior_reads + 2); /* Preserve unrelated cache contents. */
  CHECK(writes == (fail_call ? 0u : 1u)); /* Cleanup never writes back. */
  printf("PASS %s result=%d erases=%u metadata_writes=%u cache_refilled\n",
         scenario, result, erases, writes);
}

int main(int argc, char **argv) {
  CHECK(argc == 2);
  const char *scenario = argv[1];
  unsigned logical = strstr(scenario, "second") || strstr(scenario, "multi") ? 8192 : 4096;
  setup(logical);
  if (!strncmp(scenario, "gc_", 3)) {
    check_gc(scenario);
    return 0;
  }

  s32_t result;
  if (!strcmp(scenario, "format_failure")) {
    SPIFFS_unmount(&fs);
    erases = writes = 0;
    fail_call = 1;
    result = SPIFFS_format(&fs);
    CHECK(result == SPIFFS_ERR_ERASE_FAIL);
    CHECK(erases == 1 && writes == 0 && fs.free_blocks == 7);
  } else {
    if (!strcmp(scenario, "direct_pre")) fail_call = 1;
    else if (!strcmp(scenario, "direct_partial")) { fail_call = 1; partial = 2048; }
    else if (!strcmp(scenario, "direct_second")) fail_call = 2;
    else CHECK(!strcmp(scenario, "direct_success") || !strcmp(scenario, "direct_success_multi"));

    result = spiffs_erase_block(&fs, 0);
    CHECK(result == (fail_call ? SPIFFS_ERR_INTERNAL : SPIFFS_OK));
    CHECK(writes == (fail_call ? 0u : 1u));
    CHECK(erases == logical / 4096);
    CHECK(fs.free_blocks == (fail_call ? 7u : 8u));
    CHECK(fs.max_erase_count == (fail_call ? 12u : 13u));
    if (!strcmp(scenario, "direct_partial")) CHECK(flash[0] == 255 && flash[2048] == 0xab);
    if (!strcmp(scenario, "direct_second")) CHECK(flash[0] == 255 && flash[4096] == 0xab);
    if (!strcmp(scenario, "direct_pre")) CHECK(flash[0] == 0xab);
    if (!fail_call) {
      CHECK(flash[0] == 255 && flash[logical - 1] == 255);
      spiffs_obj_id count;
      memcpy(&count, flash + SPIFFS_ERASE_COUNT_PADDR(&fs, 0), sizeof count);
      CHECK(count == 12);
    }
  }
  printf("PASS %s result=%d erases=%u metadata_writes=%u free_blocks=%u max_count=%u\n",
         scenario, result, erases, writes, fs.free_blocks, fs.max_erase_count);
  return 0;
}
