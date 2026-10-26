#include "boot_diag.h"

#if defined(PIXL_BOOT_DIAGNOSTICS) && PIXL_BOOT_DIAGNOSTICS
#include <limits.h>
#include <string.h>
#include "crc32.h"
#include "mbedtls/sha256.h"
#include "nrf_dfu_types.h"
#include "../app/settings/scene/settings_device_info.h"

/* This observer deliberately supports only the known nRF52832 geometry.
 * Its addresses are derived from that verified geometry, never BLE input.
 * Future boards/layouts must be reviewed before broadening these bounds. */
#define DIAG_FLASH_SIZE 0x80000u
#define DIAG_RAM_SIZE 0x10000u
#define DIAG_PAGE_SIZE 0x1000u
#define DIAG_RAM_START 0x20000000u
#define DIAG_MAX_BOOT_SIZE 0x8000u
#define DIAG_SETTINGS_CRC_BYTES 88u

_Static_assert(offsetof(nrf_dfu_settings_t, settings_version) == 4, "DFU settings version offset");
_Static_assert(offsetof(nrf_dfu_settings_t, app_version) == 8, "DFU app counter offset");
_Static_assert(offsetof(nrf_dfu_settings_t, bootloader_version) == 12, "DFU boot counter offset");
_Static_assert(offsetof(nrf_dfu_settings_t, init_command) == 92, "DFU settings CRC span");

#ifndef BOOT_DIAG_FLASH_PTR
#define BOOT_DIAG_FLASH_PTR(address) ((const uint8_t *)(uintptr_t)(address))
#endif

static void diag_put32(uint8_t *out, uint32_t value) {
    for (unsigned i = 0; i < 4; ++i) out[i] = (uint8_t)(value >> (8u * i));
}

static uint32_t diag_read32(uint32_t address) {
    uint32_t value;
    memcpy(&value, BOOT_DIAG_FLASH_PTR(address), sizeof(value));
    return value;
}

bool boot_diag_snapshot(uint8_t *out, size_t capacity) {
    if (!out || capacity < BOOT_DIAG_SIZE) return false;
    memset(out, 0, BOOT_DIAG_SIZE);
    memcpy(out, "PXBD", 4);
    out[4] = 1;
    uint16_t flags = 0;
    const uint32_t part = NRF_FICR->INFO.PART;
    const uint32_t page_size = NRF_FICR->CODEPAGESIZE;
    const uint32_t pages = NRF_FICR->CODESIZE;
    const uint32_t flash_size = page_size && pages <= UINT32_MAX / page_size ? page_size * pages : 0;
    const uint32_t ram_kib = NRF_FICR->INFO.RAM;
    const uint32_t ram_size = ram_kib <= UINT32_MAX / 1024u ? ram_kib * 1024u : 0;
    diag_put32(out + 8, part);
    diag_put32(out + 12, NRF_FICR->INFO.VARIANT);
    diag_put32(out + 16, flash_size);
    diag_put32(out + 20, ram_size);
    diag_put32(out + 24, page_size);
    const uint32_t uicr_boot = *MBR_UICR_BOOTLOADER_ADDR;
    diag_put32(out + 40, uicr_boot);
    const uint32_t uicr_params = *MBR_UICR_PARAM_PAGE_ADDR;
    diag_put32(out + 112, uicr_params);
    if (part != 0x52832u || page_size != DIAG_PAGE_SIZE || flash_size != DIAG_FLASH_SIZE ||
        NRF_FICR->INFO.FLASH != DIAG_FLASH_SIZE / 1024u || ram_size != DIAG_RAM_SIZE) return true;
    flags |= 1u;

    settings_softdevice_info_t sd;
    if (settings_device_info_read_softdevice(&sd)) {
        flags |= 1u << 1;
        diag_put32(out + 28, sd.variant);
        diag_put32(out + 32, sd.version);
        out[36] = (uint8_t)sd.fwid;
        out[37] = (uint8_t)(sd.fwid >> 8);
    }

    const uint32_t mbr_boot = diag_read32(MBR_BOOTLOADER_ADDR);
    diag_put32(out + 44, mbr_boot);
    if (mbr_boot != UINT32_MAX && uicr_boot != UINT32_MAX && mbr_boot != uicr_boot)
        flags |= 1u << 6;
    /* Match the MBR's precedence. An invalid non-erased MBR entry is not
     * silently replaced by a plausible UICR value. */
    uint32_t boot = mbr_boot;
    if (mbr_boot != UINT32_MAX) out[5] = 1;
    else if (uicr_boot != UINT32_MAX) { out[5] = 2; boot = uicr_boot; }

    const uint32_t settings_address = flash_size - page_size;
    const uint32_t boot_end = settings_address - page_size;
    const uint32_t mbr_params = diag_read32(MBR_PARAM_PAGE_ADDR);
    const uint32_t params = mbr_params != UINT32_MAX ? mbr_params :
                            (uicr_params != UINT32_MAX ? uicr_params : 0);
    diag_put32(out + 116, mbr_params);
    diag_put32(out + 120, params);
    if (params == boot_end) flags |= 1u << 8;
    diag_put32(out + 52, settings_address);
    const uint32_t settings_version = diag_read32(settings_address + 4);
    const uint32_t stored_crc = diag_read32(settings_address);
    diag_put32(out + 56, settings_version);
    diag_put32(out + 68, stored_crc);
    /* CRC covers only bytes 4..91, as SDK17.1 settings_crc_get(). It does
     * not validate init data, boot-validation records, signatures, or code. */
    if (settings_version == 2u) {
        flags |= 1u << 3;
        const uint32_t crc = crc32_compute(BOOT_DIAG_FLASH_PTR(settings_address + 4),
                                          DIAG_SETTINGS_CRC_BYTES, NULL);
        diag_put32(out + 72, crc);
        if (stored_crc != UINT32_MAX && crc == stored_crc) {
            flags |= 1u << 4;
            diag_put32(out + 60, diag_read32(settings_address + 8));
            diag_put32(out + 64, diag_read32(settings_address + 12));
        }
    }

    if (out[5] && boot % page_size == 0 && boot < boot_end && boot_end - boot <= DIAG_MAX_BOOT_SIZE) {
        flags |= 1u << 2;
        diag_put32(out + 48, boot);
        const uint32_t stack = diag_read32(boot);
        const uint32_t reset = diag_read32(boot + 4);
        if (stack > DIAG_RAM_START && stack <= DIAG_RAM_START + ram_size && !(stack & 7u) &&
            (reset & 1u) && (reset & ~1u) >= boot && (reset & ~1u) < boot_end) {
            flags |= 1u << 7;
            /* Fixed flash only, no allocation or interrupt masking. Includes
             * padding, excludes the MBR parameter/backup and settings pages.
             * This fingerprint is not a complete backup or authenticity proof. */
            const uint32_t length = boot_end - boot;
            if ((flags & (1u << 8)) &&
                mbedtls_sha256_ret(BOOT_DIAG_FLASH_PTR(boot), length, out + 80, 0) == 0) {
                flags |= 1u << 5;
                diag_put32(out + 76, length);
            } else memset(out + 80, 0, 32);
        }
    }
    out[6] = (uint8_t)flags;
    out[7] = (uint8_t)(flags >> 8);
    return true;
}
#endif
