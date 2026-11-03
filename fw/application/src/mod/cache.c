#include "cache.h"

#include <stdint.h>
#include <string.h>

#include "ntag_emu.h"

#include "nrf_error.h"
#include "nrf_log.h"
#include "nrf_log_ctrl.h"

#include "vfs.h"
#include "vfs_meta.h"

#include "nrf_pwr_mgmt.h"
#include "settings.h"
#include "crc32.h"

// nRF52832: eight 8 KiB RAM blocks, each with two 4 KiB retention sections.
#define CACHE_RAM_BASE 0x20000000UL
#define CACHE_RAM_BLOCK_SIZE 0x2000UL
#define CACHE_RAM_SECTION_SIZE 0x1000UL
#define CACHE_RAM_BLOCK_COUNT 8UL

extern uint8_t __start_noinit;
extern uint8_t __stop_noinit;

static __attribute__((section(".noinit"))) cache_data_t m_cache_data;
static __attribute__((section(".noinit"))) int32_t m_cache_crc32;

static size_t cache_noinit_size(void) {
    uintptr_t start = (uintptr_t)&__start_noinit;
    uintptr_t end = (uintptr_t)&__stop_noinit;
    return end >= start ? (size_t)(end - start) : 0;
}

static uint32_t cache_enable_retention(uintptr_t start, uintptr_t end) {
    if (start < CACHE_RAM_BASE || end < start ||
        end > CACHE_RAM_BASE + CACHE_RAM_BLOCK_COUNT * CACHE_RAM_BLOCK_SIZE) {
        return NRF_ERROR_INVALID_PARAM;
    }
    if (start == end) {
        return NRF_SUCCESS;
    }

    uint32_t first = (start - CACHE_RAM_BASE) / CACHE_RAM_SECTION_SIZE;
    uint32_t last = (end - 1 - CACHE_RAM_BASE) / CACHE_RAM_SECTION_SIZE;
    for (uint32_t section = first; section <= last; section++) {
        uint8_t block = section / 2;
        uint32_t mask = section % 2 ? POWER_RAM_POWER_S1RETENTION_Msk : POWER_RAM_POWER_S0RETENTION_Msk;
        // The SoftDevice writes POWERSET, so unrelated power/retention bits stay set.
        uint32_t error = sd_power_ram_power_set(block, mask);
        if (error != NRF_SUCCESS) {
            return error;
        }
    }
    return NRF_SUCCESS;
}

void cache_invalidate(void) {
    /* Existing retained field, no new RAM or layout. A volatile aligned store
     * must survive the imminent reset; cache_valid rejects it regardless of
     * any old or coincidentally matching CRC. The launcher also requires 1. */
    *(volatile int32_t *)&m_cache_data.enabled = -1;
}

bool cache_valid(){
    if (m_cache_data.enabled != 0 && m_cache_data.enabled != 1) {
        return false;
    }
    NRF_LOG_INFO("noinit area: [0x%X, 0x%X], %u bytes", &__start_noinit, &__stop_noinit,
                 (uint32_t)cache_noinit_size());
    NRF_LOG_INFO("m_cache_data address: 0x%X", &m_cache_data);
    return m_cache_crc32 == crc32_compute((const int8_t *)&m_cache_data, sizeof(cache_data_t), NULL);
}

int32_t cache_clean() {
    NRF_LOG_INFO("Cleaning cache...");
    // 重置一下noinit ram区域
    memset(&__start_noinit, 0x0, cache_noinit_size());
    m_cache_crc32 = crc32_compute(&m_cache_data, sizeof(cache_data_t), NULL);

    NRF_LOG_INFO("Reset noinit ram done.");
    return NRF_SUCCESS;
}

int32_t cache_save() {
    NRF_LOG_INFO("Saving cache...");
    m_cache_crc32 = crc32_compute(&m_cache_data, sizeof(cache_data_t), NULL);
    NRF_LOG_INFO("Cache data: enabled = %d, id = %d", m_cache_data.enabled, m_cache_data.id);

    return cache_enable_retention((uintptr_t)&__start_noinit, (uintptr_t)&__stop_noinit);
}

cache_data_t *cache_get_data() {
    NRF_LOG_INFO("Cache data: enabled = %d, id = %d", m_cache_data.enabled, m_cache_data.id);
    return &m_cache_data;
}
