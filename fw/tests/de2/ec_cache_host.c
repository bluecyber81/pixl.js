#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#define NRF_SUCCESS 0
#define NRF_ERROR_INVALID_PARAM 7
#define NRF_LOG_INFO(...) ((void)0)
#define POWER_RAM_POWER_S0RETENTION_Msk (1u << 16)
#define POWER_RAM_POWER_S1RETENTION_Msk (1u << 17)

typedef struct { int enabled; unsigned id; uint8_t rest[2500]; } cache_data_t;
static cache_data_t m_cache_data;
static int32_t m_cache_crc32;
static uint8_t *test_start, *test_end;
static uint32_t ram[8];
static unsigned calls, fail_call, crc_calls;

static uint32_t sd_power_ram_power_set(uint8_t block, uint32_t mask) {
    assert(block < 8);
    ++calls;
    if (calls == fail_call) return 42;
    ram[block] |= mask;
    return 0;
}
static uint32_t crc32_compute(const void *data, size_t size, const void *previous) {
    assert(data == &m_cache_data && size == sizeof(m_cache_data) && previous == NULL);
    ++crc_calls;
    return 0x12345678;
}

/* ACTUAL_CACHE_FUNCTIONS */

static void reset(void) {
    for (unsigned i = 0; i < 8; ++i) ram[i] = 3;
    calls = fail_call = crc_calls = 0;
}

int main(void) {
    reset();
    assert(cache_enable_retention(0x20002bd0, 0x200035c0) == 0);
    assert(calls == 2 && ram[1] == (3 | (3u << 16)));
    for (unsigned i = 0; i < 8; ++i) if (i != 1) assert(ram[i] == 3);

    reset();
    assert(cache_enable_retention(0x20002000, 0x20003000) == 0);
    assert(calls == 1 && ram[1] == (3 | (1u << 16)));
    reset();
    assert(cache_enable_retention(0x20003000, 0x20004000) == 0);
    assert(calls == 1 && ram[1] == (3 | (1u << 17)));
    reset();
    assert(cache_enable_retention(0x20003fff, 0x20004001) == 0);
    assert(calls == 2 && ram[1] == (3 | (1u << 17)) && ram[2] == (3 | (1u << 16)));
    reset();
    assert(cache_enable_retention(0x20000000, 0x20010000) == 0);
    assert(calls == 16);
    for (unsigned i = 0; i < 8; ++i) assert(ram[i] == (3 | (3u << 16)));

    reset();
    assert(cache_enable_retention(0x20003000, 0x20003000) == 0 && calls == 0);
    assert(cache_enable_retention(0x20010000, 0x20010000) == 0 && calls == 0);
    assert(cache_enable_retention(0x1fffffff, 0x20003000) == NRF_ERROR_INVALID_PARAM);
    assert(cache_enable_retention(0x20003000, 0x20010001) == NRF_ERROR_INVALID_PARAM);
    assert(cache_enable_retention(0x20003000, 0x20002000) == NRF_ERROR_INVALID_PARAM);
    assert(calls == 0);
    reset();
    fail_call = 2;
    assert(cache_enable_retention(0x20002bd0, 0x20004500) == 42 && calls == 2);
    assert(ram[1] == (3 | (1u << 16)) && ram[2] == 3);

    uint8_t area[0x9f0 + 16];
    memset(area, 0xa5, sizeof(area));
    test_start = area + 8; test_end = area + 8 + 0x9f0;
    reset();
    assert(cache_noinit_size() == 0x9f0);
    assert(cache_clean() == 0 && crc_calls == 1 && m_cache_crc32 == 0x12345678);
    for (unsigned i = 0; i < sizeof(area); ++i)
        assert(area[i] == ((i < 8 || i >= 8 + 0x9f0) ? 0xa5 : 0));
    test_end = test_start + 5;
    assert(cache_noinit_size() == 5);
    test_end = test_start - 1;
    assert(cache_noinit_size() == 0);

    reset();
    test_start = (uint8_t *)(uintptr_t)0x20002bd0;
    test_end = (uint8_t *)(uintptr_t)0x200035c0;
    assert(cache_save() == 0 && calls == 2 && crc_calls == 1);
    reset(); fail_call = 1;
    assert(cache_save() == 42 && calls == 1);
    puts("PASS cache: actual layout, every section edge, preserved bits, error propagation, full-byte clearing");
    return 0;
}
