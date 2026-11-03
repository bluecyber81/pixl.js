#include "hal_spi_flash.h"
#include "hal_spi_bus.h"
#include "app_timer.h"
#include "app_util_platform.h"
#include <string.h>
#include "nordic_common.h"
#include "nrf_drv_spi.h"
#include "nrf_error.h"
#include "nrf_gpio.h"

#include "nrf_log.h"
#include "nrf_log_ctrl.h"

#include "boards.h"

#define PAGE_SIZE 256
#define CMD_ADDR_SIZE 4
#define FLASH_ADDRESS_LIMIT (1u << 24)

/* Only page program and 4-KiB sector erase are issued below. The supported
 * W25Q/MX25L parts need at most a few ms / hundreds of ms respectively;
 * allow generous margins, including the MX25L25645G 5-ms/600-ms limits.
 * app_timer's 24-bit RTC counter continues running while application IRQs
 * are masked. The poll cap also bounds failure if that clock stops. */
#define FLASH_PROGRAM_TIMEOUT_MS 100u
#define FLASH_READY_TIMEOUT_MS 5000u
#define FLASH_BUSY_POLL_LIMIT 1000000u
#define FLASH_STATUS_BUSY 0x01u
#define FLASH_STATUS_WEL 0x02u

/* command list */
#define CMD_WRSR (0x01)       /* Write Status Register */
#define CMD_PP (0x02)         /* Page Program */
#define CMD_READ (0x03)       /* Read Data */
#define CMD_WRDI (0x04)       /* Write Disable */
#define CMD_RDSR1 (0x05)      /* Read Status Register-1 */
#define CMD_WREN (0x06)       /* Write Enable */
#define CMD_FAST_READ (0x0B)  /* Fast Read */
#define CMD_ERASE_4K (0x20)   /* Sector Erase:4K */
#define CMD_RDSR2 (0x35)      /* Read Status Register-2 */
#define CMD_ERASE_32K (0x52)  /* 32KB Block Erase */
#define CMD_JEDEC_ID (0x9F)   /* Read JEDEC ID */
#define CMD_ERASE_full (0xC7) /* Chip Erase */
#define CMD_ERASE_64K (0xD8)  /* 64KB Block Erase */
#define CMD_DP (0xB9)         /* Deep Power Down Mode */
#define CMD_RDP (0xAB)        /* Release from Deep Power-Down */

/* JEDEC Manufacturer¡¯s ID */
#define MF_ID (0xEF)
/* JEDEC Device ID: Memory type and Capacity */
#define MTC_W25Q16_BV_CL_CV (0x4015) /* W25Q16BV W25Q16CL W25Q16CV  */
#define MTC_W25Q16_DW (0x6015)       /* W25Q16DW  */
#define MTC_W25Q32_BV (0x4016)       /* W25Q32BV */
#define MTC_W25Q32_DW (0x6016)       /* W25Q32DW */
#define MTC_W25Q64_BV_CV (0x4017)    /* W25Q64BV W25Q64CV */
#define MTC_W25Q64_DW (0x6017)       /* W25Q64DW */
#define MTC_W25Q128_BV (0x4018)      /* W25Q128BV */
#define MTC_W25Q256_FV (TBD)         /* W25Q256FV */
#define MTC_MX25L25645_GM2I (0x2019) /* MX25L25645GM2I-10G */

static spi_device_t m_dev;

/* All program/erase calls are synchronous foreground VFS operations. No
 * external master or IRQ writer owns this flash. Once RDSR1 proves ready,
 * ordinary reads cannot make it busy; skip that redundant transaction until
 * init/sleep, a mutation or an I/O failure invalidates the observation.
 * This is a readiness hint, never a data cache or a concurrency lock. */
static volatile bool m_read_ready;
static volatile uint32_t m_io_fault_generation;

static inline void hal_spi_flash_command_begin(uint8_t command) {
    /* Called only after acquiring the bus IRQ guard. An IRQ reader before
     * acquisition may have refreshed the earlier readiness observation. */
    if (command == CMD_PP || command == CMD_ERASE_4K || command == CMD_DP || command == CMD_RDP) {
        m_read_ready = false;
    }
}

static inline void hal_spi_flash_io_result(ret_code_t result) {
    if (result != NRF_SUCCESS) {
        uint8_t nested;
        app_util_critical_region_enter(&nested);
        m_read_ready = false;
        m_io_fault_generation++;
        app_util_critical_region_exit(nested);
    }
}

static inline ret_code_t hal_spi_flash_write_read(uint8_t *tx_data, uint8_t tx_len, uint8_t *rx_data, uint32_t rx_len) {
    hal_spi_bus_aquire(&m_dev);
    hal_spi_flash_command_begin(tx_data[0]);

    spi_transaction_t trans_tx = {
        .p_tx_buffer = tx_data,
        .tx_length = tx_len,
        .p_rx_buffer = NULL,
        .rx_length = 0,
    };

    ret_code_t result = hal_spi_bus_xfer(&trans_tx);

    if (result == NRF_SUCCESS && rx_len > 0) {
        spi_transaction_t trans_rx = {
            .p_tx_buffer = NULL,
            .tx_length = 0,
            .p_rx_buffer = rx_data,
            .rx_length = rx_len,
        };

        result = hal_spi_bus_xfer(&trans_rx);
    }

    /* Invalidate before releasing the IRQ guard, so an interleaved reader
     * cannot reuse an observation made before this failed transaction. */
    hal_spi_flash_io_result(result);
    hal_spi_bus_release(&m_dev);
    return result;
}

static inline ret_code_t hal_spi_flash_write_write(uint8_t *tx_data, uint8_t tx_len, const uint8_t *tx_data2, uint32_t tx_len2) {
    hal_spi_bus_aquire(&m_dev);
    hal_spi_flash_command_begin(tx_data[0]);

    spi_transaction_t trans_tx = {
        .p_tx_buffer = tx_data,
        .tx_length = tx_len,
        .p_rx_buffer = NULL,
        .rx_length = 0,
    };

    ret_code_t result = hal_spi_bus_xfer(&trans_tx);

    if (result == NRF_SUCCESS && tx_len2 > 0) {
        spi_transaction_t trans_rx = {
            .p_tx_buffer = (void *)tx_data2,
            .tx_length = tx_len2,
            .p_rx_buffer = NULL,
            .rx_length = 0,
        };

        result = hal_spi_bus_xfer(&trans_rx);
    }

    hal_spi_flash_io_result(result);
    hal_spi_bus_release(&m_dev);
    return result;
}

static inline ret_code_t hal_spi_flash_read_status(uint8_t cmd, uint8_t *status) {
    uint8_t tx[1];
    tx[0] = cmd;
    return hal_spi_flash_write_read(tx, 1, status, 1);
}

static inline ret_code_t hal_spi_flash_write_cmd(uint8_t cmd) {
    uint8_t tx[1];
    tx[0] = cmd;
    return hal_spi_flash_write_read(tx, 1, NULL, 0);
}

static ret_code_t hal_spi_flash_wait_busy(uint32_t timeout_ticks) {
    m_read_ready = false;
    uint32_t started = app_timer_cnt_get();
    for (uint32_t polls = 0; polls < FLASH_BUSY_POLL_LIMIT; polls++) {
        uint8_t status;
        uint32_t fault_generation = m_io_fault_generation;
        ret_code_t result = hal_spi_flash_read_status(CMD_RDSR1, &status);
        if (result != NRF_SUCCESS) return result;
        if (!(status & FLASH_STATUS_BUSY)) {
            /* An IRQ reader can run at CS release. A newer failure must not
             * be hidden by the older successful status observation. */
            uint8_t nested;
            app_util_critical_region_enter(&nested);
            m_read_ready = fault_generation == m_io_fault_generation;
            app_util_critical_region_exit(nested);
            return NRF_SUCCESS;
        }
        if (app_timer_cnt_diff_compute(app_timer_cnt_get(), started) >= timeout_ticks) {
            hal_spi_flash_io_result(NRF_ERROR_TIMEOUT);
            return NRF_ERROR_TIMEOUT;
        }
    }
    hal_spi_flash_io_result(NRF_ERROR_TIMEOUT);
    return NRF_ERROR_TIMEOUT;
}

static ret_code_t hal_spi_flash_write_enable(void) {
    ret_code_t result = hal_spi_flash_write_cmd(CMD_WREN);
    if (result != NRF_SUCCESS) return result;
    uint8_t status;
    result = hal_spi_flash_read_status(CMD_RDSR1, &status);
    if (result != NRF_SUCCESS) return result;
    if ((status & (FLASH_STATUS_BUSY | FLASH_STATUS_WEL)) != FLASH_STATUS_WEL) {
        hal_spi_flash_io_result(NRF_ERROR_INVALID_STATE);
        return NRF_ERROR_INVALID_STATE;
    }
    return NRF_SUCCESS;
}

ret_code_t hal_spi_flash_init() {
    m_read_ready = false;
    m_dev.cs_pin = FLASH_CS_PIN;
    hal_spi_bus_attach(&m_dev);

    return hal_spi_flash_write_cmd(CMD_RDP);
}

ret_code_t hal_spi_flash_info(flash_info_t *info) {
    uint8_t rx[3] = {0};
    uint8_t tx[1] = {0x9f};
    uint16_t memory_type_capacity;

    if (info == NULL) return NRF_ERROR_INVALID_PARAM;
    memset(info, 0, sizeof(*info));
    ret_code_t result = hal_spi_flash_write_read(tx, 1, rx, 3);
    if (result != NRF_SUCCESS) return result;
    NRF_LOG_DEBUG("FLASH ID:");
    NRF_LOG_HEXDUMP_DEBUG(rx, 3);

    info->block_size = 4096;
    info->page_size = 256;

    /* get memory type and capacity */
    memory_type_capacity = rx[1];
    memory_type_capacity = (memory_type_capacity << 8) | rx[2];

    switch (memory_type_capacity) {
    case MTC_MX25L25645_GM2I:
        NRF_LOG_INFO("MX25L25645GM2I-10G detection");
        info->block_count = 8192;
        break;
    case MTC_W25Q128_BV:
        NRF_LOG_INFO("W25Q128BV detection");
        info->block_count = 4096;
        break;
    case MTC_W25Q64_BV_CV:
        NRF_LOG_INFO("W25Q64BV or W25Q64CV detection");
        info->block_count = 2048;
        break;
    case MTC_W25Q64_DW:
        NRF_LOG_INFO("W25Q64DW detection");
        info->block_count = 2048;
        break;
    case MTC_W25Q32_BV:
        NRF_LOG_INFO("W25Q32BV detection");
        info->block_count = 1024;
        break;
    case MTC_W25Q32_DW:
        NRF_LOG_INFO("W25Q32DW detection");
        info->block_count = 1024;
        break;
    case MTC_W25Q16_BV_CL_CV:
        NRF_LOG_INFO("W25Q16BV or W25Q16CL or W25Q16CV detection");
        info->block_count = 512;
        break;
    case MTC_W25Q16_DW:
        NRF_LOG_INFO("W25Q16DW detection");
        info->block_count = 512;
        break;
    default:
        NRF_LOG_INFO("Memory Capacity error! %d", memory_type_capacity);
        info->block_count = 0;
        return NRF_ERROR_INVALID_PARAM;
    }
    return NRF_SUCCESS;
}

ret_code_t hal_spi_flash_read(uint32_t address, void *buffer, size_t size) {

    uint8_t tx[4];
    if (size == 0) return NRF_SUCCESS;
    /* The wire format below carries exactly 24 address bits. Subtraction
     * avoids overflow for both oversized size_t values and end addresses. */
    if (buffer == NULL || address >= FLASH_ADDRESS_LIMIT || size > FLASH_ADDRESS_LIMIT - address) {
        return NRF_ERROR_INVALID_PARAM;
    }
    if (!m_read_ready) {
        ret_code_t result = hal_spi_flash_wait_busy(APP_TIMER_TICKS(FLASH_READY_TIMEOUT_MS));
        if (result != NRF_SUCCESS) return result;
    }
    /* READ does not require WRDI. Do not clear another operation's WEL. */

    tx[0] = CMD_READ;
    tx[1] = (address >> 16);
    tx[2] = (address >> 8);
    tx[3] = (address);
    return hal_spi_flash_write_read(tx, 4, buffer, size);
}

ret_code_t hal_spi_flash_prog(uint32_t address, const void *buffer, size_t size) {

    if (size == 0) return NRF_SUCCESS;
    /* A single Page Program must not wrap within its 256-byte page. The
     * filesystem uses 256-byte logical pages and performs page-local writes. */
    if (buffer == NULL || address >= FLASH_ADDRESS_LIMIT || size > FLASH_ADDRESS_LIMIT - address ||
        size > PAGE_SIZE - (address % PAGE_SIZE)) {
        return NRF_ERROR_INVALID_PARAM;
    }
    ret_code_t result = hal_spi_flash_wait_busy(APP_TIMER_TICKS(FLASH_READY_TIMEOUT_MS));
    if (result != NRF_SUCCESS) return result;
    result = hal_spi_flash_write_enable();
    if (result != NRF_SUCCESS) return result;

    uint8_t tx[4];
    tx[0] = CMD_PP;
    tx[1] = (address >> 16);
    tx[2] = (address >> 8);
    tx[3] = (address);
    m_read_ready = false;
    result = hal_spi_flash_write_write(tx, 4, buffer, size);
    if (result != NRF_SUCCESS) return result;
    return hal_spi_flash_wait_busy(APP_TIMER_TICKS(FLASH_PROGRAM_TIMEOUT_MS));
}

ret_code_t hal_spi_flash_erase(uint32_t address) {
    /* Sector erase ignores the low 12 bits; every sector selected by a valid
     * 24-bit address lies entirely below this limit. Do not wrap high bits. */
    if (address >= FLASH_ADDRESS_LIMIT) return NRF_ERROR_INVALID_PARAM;
    ret_code_t result = hal_spi_flash_wait_busy(APP_TIMER_TICKS(FLASH_READY_TIMEOUT_MS));
    if (result != NRF_SUCCESS) return result;
    result = hal_spi_flash_write_enable();
    if (result != NRF_SUCCESS) return result;

    uint8_t tx[4];
    tx[0] = CMD_ERASE_4K;
    tx[1] = (address >> 16);
    tx[2] = (address >> 8);
    tx[3] = (address);
    m_read_ready = false;
    result = hal_spi_flash_write_read(tx, 4, NULL, 0);
    if (result != NRF_SUCCESS) return result;
    return hal_spi_flash_wait_busy(APP_TIMER_TICKS(FLASH_READY_TIMEOUT_MS));
}

void hal_spi_flash_sleep() {
    m_read_ready = false;
    ret_code_t result = hal_spi_flash_write_cmd(CMD_DP);
    if (result != NRF_SUCCESS) NRF_LOG_WARNING("Flash sleep failed: %lu", (unsigned long)result);
}
