#ifndef SETTINGS_DEVICE_INFO_H
#define SETTINGS_DEVICE_INFO_H

#include <limits.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

#include "nrf.h"
#include "nrf_mbr.h"
#include "nrf_sdm.h"
#include "nrf_bootloader_info.h"

typedef struct {
    uint32_t variant;
    uint32_t version;
    uint16_t fwid;
} settings_softdevice_info_t;

/* Only fixed, documented FICR/SoftDevice information locations are read. The
 * build-time SD_VERSION and SD_VARIANT_ID describe headers, not the device. */
static inline bool settings_device_info_read_softdevice(settings_softdevice_info_t *info) {
    if (!info) {
        return false;
    }
    *info = (settings_softdevice_info_t){0};
    uint32_t page_size = NRF_FICR->CODEPAGESIZE;
    uint32_t pages = NRF_FICR->CODESIZE;
    if (!page_size || !pages || pages > UINT32_MAX / page_size) {
        return false;
    }
    uint32_t flash_size = page_size * pages;
    if (flash_size < MBR_SIZE + SD_VERSION_OFFSET + sizeof(uint32_t)) {
        return false;
    }

    uint32_t info_size = SD_INFO_STRUCT_SIZE_GET(MBR_SIZE);
    if (info_size < SD_VERSION_OFFSET - SOFTDEVICE_INFO_STRUCT_OFFSET + sizeof(uint32_t) ||
        info_size > flash_size - SOFTDEVICE_INFO_STRUCT_ADDRESS || !SD_PRESENT) {
        return false;
    }
    uint32_t sd_size = SD_SIZE_GET(MBR_SIZE);
    /* Nordic's metadata size includes the MBR, as used by nrf_dfu_bank0_start_addr(). */
    if (sd_size < SOFTDEVICE_INFO_STRUCT_ADDRESS + info_size || sd_size > flash_size) {
        return false;
    }

    uint32_t variant = SD_ID_GET(MBR_SIZE);
    /* Unknown variants must not be labelled as the S112 used by this build. */
    switch (variant) {
    case 112:
    case 113:
    case 122:
    case 132:
    case 140:
        break;
    default:
        return false;
    }
    uint32_t version = SD_VERSION_GET(MBR_SIZE);
    uint16_t fwid = SD_FWID_GET(MBR_SIZE);
    if (version < 1000000u || version == UINT32_MAX || fwid == 0 || fwid == UINT16_MAX) {
        return false;
    }
    info->variant = variant;
    info->version = version;
    info->fwid = fwid;
    return true;
}

static inline void settings_device_info_format_text(char *out, size_t size, const char *value) {
    if (!out || !size) {
        return;
    }
    size_t limit = size > 2 ? size - 3 : 0;
    if (limit > INT_MAX) {
        limit = INT_MAX;
    }
    snprintf(out, size, "[%.*s]", (int)limit, value ? value : "?");
}

static inline void settings_device_info_format_softdevice(char *out, size_t size,
                                                         const settings_softdevice_info_t *info) {
    if (!out || !size || !info) {
        return;
    }
    snprintf(out, size, "[S%lu %lu.%lu.%lu]", (unsigned long)info->variant,
             (unsigned long)(info->version / 1000000u),
             (unsigned long)(info->version / 1000u % 1000u), (unsigned long)(info->version % 1000u));
}

static inline void settings_device_info_format_chip(char *out, size_t size, uint32_t part) {
    if (!out || !size) {
        return;
    }
    /* PART uses hexadecimal digits, e.g. 0x52832, not decimal 52832. */
    switch (part) {
    case 0x52805:
    case 0x52810:
    case 0x52811:
    case 0x52820:
    case 0x52832:
    case 0x52833:
    case 0x52840:
        snprintf(out, size, "[nRF%05lX]", (unsigned long)part);
        break;
    default:
        snprintf(out, size, "[0x%08lX]", (unsigned long)part);
        break;
    }
}

#endif
