/*
 * t2t_emu.c
 *
 *  Created on: 2021年5月30日
 *      Author: solos
 */

#include "ntag_emu.h"

#include "app_util_platform.h"
#include "app_timer.h"
#include "boards.h"
#include "nfc_platform.h"
#include "nrf52.h"
#include "nrf52_bitfields.h"
#include "nrf_log.h"
#include "nrfx.h"

#include "nrf_pwr_mgmt.h"

#include "hal_nfc_t2t.h"

typedef enum {
    NFC_T2T_PARAM_TESTING, ///< Used for unit tests.
    NFC_T2T_PARAM_NFCID1,  /**< NFCID1 value, data can be 4, 7, or 10 bytes long (single,
                              double, or triple size).  To use default NFCID1 of specific
                              length pass one byte containing requested length.  Default
                              7-byte NFCID1 will be used if this parameter was not set.
                              This parameter can be  set before nfc_t2t_setup() to set
                              initial NFCID1 and it can be changed later. */
} nfc_t2t_param_id_t;

typedef struct {
    ntag_t ntag;
    volatile uint8_t dirty;
    volatile uint8_t busy;
    volatile bool paused;
    volatile bool field_on;
    volatile bool pending;
    volatile uint32_t generation;
    volatile uint32_t pending_generation;
    void (*volatile action)(void *);
    void *volatile action_context;
    volatile uint32_t action_generation;
    int sector;
    bool is_selecting_sector;
    ntag_update_cb_t update_cb;
    void *cb_context;
} ntag_emu_t;

ntag_emu_t ntag_emu = {0};

static const uint8_t NTAG215_Version[8] = {0x00, 0x04, 0x04, 0x02, 0x01, 0x00, 0x11, 0x03};
static const uint8_t NTAGI2CPLUS2K_Version[8] = {0x00, 0x04, 0x04, 0x05, 0x02, 0x02, 0x15, 0x03};
// NTAG215_Version[7] mean:
// 0x0F ntag213
// 0x11 ntag215
// 0x13 ntag216

static const uint8_t NTAG215_Signature[32] = {
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
};

static const uint8_t NTAG215_PwdOK[2] = {
    0x80,
    0x80,
};

static uint8_t N2E_INFO[4] = {0x00, 0x32, 0x00, 0x03};

static const uint8_t N2E_ID[16] = {
    0x21, 0x4b, 0x87, 0x02, 0x52, 0x3d, 0x0d, 0x10, 0x16, 0x3a, 0x24, 0xff, 0xff, 0xff, 0xff, 0xff,
};

static const uint8_t N2E_SELECT_BANK[1] = {0x0a};

// NTAG COMMANDS
#define NFC_CMD_READ 0x30
#define NFC_CMD_WRITE 0xA2
#define NFC_CMD_GET_VERSION 0x60
#define NFC_CMD_READ_SIG 0x3C
#define NFC_CMD_PWD_AUTH 0x1B
#define NFC_CMD_FAST_READ 0x3A
#define NFC_CMD_FAST_WRITE 0xA6
#define NFC_CMD_SECTOR_SELECT 0xC2

// N2ELITE COMMANDS
#define N2_CMD_GET_INFO 0x55
#define N2_CMD_GET_ID 0x43
#define N2_CMD_FAST_READ 0x3B
#define N2_CMD_WRITE 0xA5
#define N2_CMD_SELECT_BANK 0xA7
#define N2_CMD_FAST_WRITE 0xAE
// see https://wiki.yobi.be/index.php/N2_Elite

/* One shared snapshot, never allocated on the limited embedded stack. */
static ntag_t m_snapshot;

static void ntag_emu_deliver(bool changing);

static void nfc_received_process(const uint8_t *p_data, size_t data_length, uint8_t *plain) {
    nrf_pwr_mgmt_feed();

    if (p_data == NULL || plain == NULL || data_length == 0) {
        ntag_emu.is_selecting_sector = false;
        hal_send_ack_nack(0x0);
        return;
    }

    /* Do not ACK a write which a reentrant save/selection could replace. The
     * reader can retry after the foreground callback; IRQs remain enabled. */
    if (ntag_emu.paused || (ntag_emu.busy &&
        (p_data[0] == NFC_CMD_WRITE || p_data[0] == N2_CMD_WRITE ||
         p_data[0] == N2_CMD_FAST_WRITE || p_data[0] == NFC_CMD_FAST_WRITE))) {
        hal_send_ack_nack(0x0);
        return;
    }

    if (ntag_emu.is_selecting_sector) {
        ntag_emu.is_selecting_sector = false;
        ntag_emu.sector = p_data[0];
        NRF_LOG_INFO("NFC Sector Select Done (switch to %d)", p_data[0]);

        // To successfully access to the requested memory sector, the tag shall issue a passive ACK, which is sending NO
        // REPLY for more than 1 ms after the CRC of the second command set.
        APP_ERROR_CHECK(hal_nfc_passive_ack());
        return;
    }

    uint8_t command = p_data[0];
    uint8_t block_num = data_length > 1 ? p_data[1] : 0;
    size_t tag_size = _ntag_data_size(&ntag_emu.ntag);

    switch (command) {
    case NFC_CMD_READ:
        if (data_length < 2) {
            hal_send_ack_nack(0x0);
            break;
        }
        NRF_LOG_INFO("NFC Read Block %d", block_num);
        int full_block = ((int) ntag_emu.sector * 256 + block_num);
        size_t read_offset = (size_t)full_block * 4;
        if (ntag_emu.ntag.type == NTAG_215 && ntag_emu.sector == 0 && block_num < NTAG_DATA_SIZE / 4) {
            uint8_t chunk_data[16];
            for (size_t i = 0; i < sizeof(chunk_data); i++) {
                size_t offset = (read_offset + i) % NTAG_DATA_SIZE;
                /* NTAG215 PWD/PACK pages are never readable over RF. */
                chunk_data[i] = offset >= 133 * 4 ? 0 : plain[offset];
            }
            APP_ERROR_CHECK(hal_nfc_send(chunk_data, sizeof(chunk_data)));
        } else if (ntag_emu.ntag.type != NTAG_215 && full_block >= 0 &&
                   read_offset <= tag_size && tag_size - read_offset >= 16) {
            static uint8_t chunk_data[16] = {0};
            memcpy(chunk_data, &plain[full_block*4], 16);

            // READ command will return 4 pages (16 bytes)
            // empirically, S2 with JC1 will poll page 0xEC to read SRAM_RF_READY (which is in ED)
            if (ntag_emu.ntag.type == NTAG_I2C_PLUS_2K && full_block == 0xEC) {
                // set NS_REG.SRAM_RF_READY (byte 2 of page ED)
                // switch 2 will poll until this is set, and *then* read sram pages
                chunk_data[6] |= 0b1000;
            }

            APP_ERROR_CHECK(hal_nfc_send(chunk_data, 16));
        } else {
            hal_send_ack_nack(0x0);
        }
        break;
    case N2_CMD_WRITE:
        // similar to write but with one extra paramter to specify the bank number
        if (data_length < 7) {
            hal_send_ack_nack(0x0);
            break;
        }
        NRF_LOG_INFO("N2E Write slot:%d:", p_data[2]);
        data_length = 6;
        p_data = p_data + 1;
        /* fall through */
    case NFC_CMD_WRITE:
        NRF_LOG_INFO("NFC Write Block %d", block_num);
        if (ntag_emu.ntag.read_only) {
            NRF_LOG_INFO("NFC Read Only");
            hal_send_ack_nack(0x0);
            return;
        }
        if (data_length == 6) {
            int full_block_num = (((int) ntag_emu.sector) * 256) + block_num;
            size_t write_offset = (size_t)full_block_num * 4;
            if (full_block_num < 0 || write_offset > tag_size || tag_size - write_offset < 4) {
                hal_send_ack_nack(0x0);
                break;
            }
            ntag_emu.dirty = true;
            if (ntag_emu.ntag.type == NTAG_215 && (full_block_num == 133 || full_block_num == 134)) {
                // ignore
            } else if (full_block_num == 2) {
                plain[full_block_num * 4 + 2] = p_data[4];
                plain[full_block_num * 4 + 3] = p_data[5];
            } else {
                for (int i = 0; i < 4; i++) {
                    plain[full_block_num * 4 + i] = p_data[i + 2];
                }
            }
            hal_send_ack_nack(0xA);
        } else {
            hal_send_ack_nack(0x0);
        }
        break;
    case NFC_CMD_GET_VERSION:
        NRF_LOG_INFO("NFC Get Version for type %d", ntag_emu.ntag.type);
        if (ntag_emu.ntag.type == NTAG_I2C_PLUS_2K) {
            APP_ERROR_CHECK(hal_nfc_send(NTAGI2CPLUS2K_Version, 8));
        } else {
            APP_ERROR_CHECK(hal_nfc_send(NTAG215_Version, 8));
        }
        break;
    case NFC_CMD_READ_SIG:
        NRF_LOG_INFO("NFC Read Signature");
        hal_nfc_send(NTAG215_Signature, 32);
        break;
    case N2_CMD_FAST_READ: // TODO
        if (data_length < 4) {
            hal_send_ack_nack(0x0);
            break;
        }
        NRF_LOG_INFO("N2E Fast Read slot %d:", p_data[3]);
        /* fall through */
    case NFC_CMD_FAST_READ:
        if (data_length < 3) {
            hal_send_ack_nack(0x0);
            break;
        }
        int start_page = block_num + (ntag_emu.sector * 256);
        int end_page = p_data[2] + (ntag_emu.sector * 256);
        int page_count = end_page - start_page + 1;
        size_t fast_offset = (size_t)start_page * 4;
        size_t fast_length = (size_t)page_count * 4;
        // HAL TX is limited to 255 bytes; reject invalid requests before forming a pointer.
        if (start_page < 0 || end_page < start_page || fast_length > UINT8_MAX ||
            fast_offset > tag_size || fast_length > tag_size - fast_offset) {
            hal_send_ack_nack(0x0);
            break;
        }

        if (p_data[0] == NFC_CMD_FAST_READ && ntag_emu.ntag.type == NTAG_215 && end_page >= 133) {
            /* Standard NTAG215 FAST_READ must hide PWD/PACK just like READ.
             * Keep the backing tag and proprietary N2/V3 reads unchanged.
             * Bounds above limit this to 63 pages; hal_nfc_send copies the
             * response into its persistent DMA buffer before returning. */
            uint8_t response[63 * 4];
            for (size_t i = 0; i < fast_length; ++i) {
                size_t offset = fast_offset + i;
                response[i] = offset >= 133 * 4 ? 0 : plain[offset];
            }
            hal_nfc_send(response, fast_length);
        } else if (ntag_emu.ntag.type == NTAG_I2C_PLUS_2K && start_page == 0xed && end_page == 0xed) {
            static uint8_t ed_page[4] = {0};
            memcpy(ed_page, &plain[start_page*4], 4);

            // set NS_REG.SRAM_RF_READY
            // switch 2 will poll until this is set, and *then* read sram pages
            ed_page[2] |= 0b1000;
            hal_nfc_send(ed_page, 4);
        } else {
            hal_nfc_send(&plain[start_page*4], page_count*4);
        }
        break;
    case NFC_CMD_PWD_AUTH:
        if (data_length < 5) {
            hal_send_ack_nack(0x0);
            break;
        }
        NRF_LOG_INFO("NFC Password: %x %x %x %x", p_data[1], p_data[2], p_data[3], p_data[4]);
        hal_nfc_send(NTAG215_PwdOK, 2);
        break;
    case N2_CMD_GET_INFO:
        N2E_INFO[0] = 0;
        hal_nfc_send(N2E_INFO, 4);
        break;
    case N2_CMD_GET_ID:
        hal_nfc_send(N2E_ID, 16);
        break;
    case N2_CMD_SELECT_BANK:
        // uint8_t banknum = block_num;
        hal_nfc_send(N2E_SELECT_BANK, 1);
        break;
    case N2_CMD_FAST_WRITE:
        if (data_length < 4 || ntag_emu.ntag.read_only) {
            hal_send_ack_nack(0x0);
            break;
        }
        NRF_LOG_INFO("N2E Fast Read slot %d:", p_data[2]);
        uint8_t datasize = p_data[3];
        // N2 Elite bank writes use the existing bank-local page offset, not the V3 sector.
        size_t fast_write_offset = (size_t)block_num * 4;
        if ((size_t)datasize > data_length - 4 || fast_write_offset > tag_size ||
            (size_t)datasize > tag_size - fast_write_offset) {
            hal_send_ack_nack(0x0);
            break;
        }
        ntag_emu.dirty = true;
        for (int i = 0; i < datasize; i++) {
            plain[block_num * 4 + i] = p_data[i + 4];
        }
        hal_send_ack_nack(0xA);
        break;
    case NFC_CMD_SECTOR_SELECT:
        NRF_LOG_INFO("NFC Sector Select start");
        hal_send_ack_nack(0xA);
        ntag_emu.is_selecting_sector = true;
        break;
    case NFC_CMD_FAST_WRITE:
        // only supported for page 0xf0-0xff in sector 0 to write to sram buffer on i2c
        // for now we ignore the writes and just ack
        if (data_length < 3) {
            hal_send_ack_nack(0x0);
            break;
        }
        NRF_LOG_INFO("NFC Fast Write %x to %x", block_num, p_data[2]);
        hal_send_ack_nack(0xA);
        break;
    default:
        NRF_LOG_INFO("NFC CMD %x", p_data[0]);
        break;
    }
}

/**
 * @brief Callback function for handling NFC events.
 */

static void nfc_callback(void *p_context, hal_nfc_event_t event, const uint8_t *p_data, size_t data_length) {
    (void)p_context;

    switch (event) {
    case HAL_NFC_EVENT_FIELD_ON:
        ntag_emu.field_on = true;
        bsp_board_led_on(BSP_BOARD_LED_0);
        break;
    case HAL_NFC_EVENT_FIELD_OFF:
        bsp_board_led_off(BSP_BOARD_LED_0);
        ntag_emu.field_on = false;
        ntag_emu.sector = 0;
        ntag_emu.is_selecting_sector = false;
        ntag_emu.pending_generation = ntag_emu.generation;
        ntag_emu.pending = true;
        break;
    case HAL_NFC_EVENT_COMMAND:
        // NRF_LOG_INFO("NFC Command Received: %x", p_data[0]);
        nfc_received_process(p_data, data_length, ntag_emu.ntag.data);
        break;
    case HAL_NFC_EVENT_DATA_TRANSMITTED:
        // NRF_LOG_INFO("NFC EVENT Data Transmitted");
        break;
    default:
        // NRF_LOG_INFO("NFC EVENT %d, CMD %x", event, p_data[0]);
        break;
    }
}

void ntag_emu_set_update_cb(ntag_update_cb_t cb, void *context) {
    ntag_emu_prepare_change();
    CRITICAL_REGION_ENTER();
    ntag_emu.update_cb = cb;
    ntag_emu.cb_context = context;
    ++ntag_emu.generation;
    ntag_emu.pending = false;
    ntag_emu.action = NULL;
    ntag_emu.paused = cb == NULL;
    CRITICAL_REGION_EXIT();
}

ntag_t *ntag_emu_get_current_tag() { return &(ntag_emu.ntag); }

static void ntag_emu_deliver(bool changing) {
    ntag_update_cb_t callback = NULL;
    void *context = NULL;
    ntag_event_type_t type = NTAG_EVENT_TYPE_READ;
    CRITICAL_REGION_ENTER();
    if (!ntag_emu.busy &&
        (changing ? ntag_emu.dirty : (!ntag_emu.paused && !ntag_emu.field_on && ntag_emu.pending &&
                                    ntag_emu.pending_generation == ntag_emu.generation))) {
        ntag_emu.pending = false;
        type = ntag_emu.dirty ? NTAG_EVENT_TYPE_WRITTEN : NTAG_EVENT_TYPE_READ;
        ntag_emu.dirty = false;
        if (type == NTAG_EVENT_TYPE_WRITTEN) ntag_emu.action = NULL;
        callback = ntag_emu.update_cb;
        context = ntag_emu.cb_context;
        if (callback) {
            ntag_emu.busy = true;
            memcpy(&m_snapshot, &ntag_emu.ntag, sizeof(m_snapshot));
            /* No stale scheduler entry may reprogram a later hardware owner. */
            if (!changing) ntag_emu_set_uuid_only(&m_snapshot);
        }
    }
    CRITICAL_REGION_EXIT();
    if (callback) {
        callback(type, context, &m_snapshot);
        /* A callback may select another tag. Never reset its flags/data here. */
        CRITICAL_REGION_ENTER();
        ntag_emu.busy = false;
        CRITICAL_REGION_EXIT();
    }
}

void ntag_emu_prepare_change(void) {
    CRITICAL_REGION_ENTER();
    ntag_emu.paused = true;
    ntag_emu.action = NULL;
    CRITICAL_REGION_EXIT();
    ntag_emu_deliver(true);
    /* A reentrant callback may have selected a tag. This caller still owns a
     * transition and must finish changing its app buffer before reception. */
    CRITICAL_REGION_ENTER();
    ntag_emu.paused = true;
    ntag_emu.action = NULL;
    CRITICAL_REGION_EXIT();
}

uint32_t ntag_emu_get_generation(void) { return ntag_emu.generation; }

void ntag_emu_request_action(void (*action)(void *), void *context, uint32_t generation) {
    CRITICAL_REGION_ENTER();
    if (action && !ntag_emu.paused && ntag_emu.update_cb && context == ntag_emu.cb_context &&
        generation == ntag_emu.generation) {
        ntag_emu.action = action;
        ntag_emu.action_context = context;
        ntag_emu.action_generation = generation;
    }
    CRITICAL_REGION_EXIT();
}

void ntag_emu_process_pending(void) {
    ntag_emu_deliver(false);
    void (*action)(void *) = NULL;
    void *context = NULL;
    CRITICAL_REGION_ENTER();
    if (!ntag_emu.busy && !ntag_emu.paused && !ntag_emu.field_on && !ntag_emu.dirty &&
        ntag_emu.action && ntag_emu.action_generation == ntag_emu.generation) {
        action = ntag_emu.action;
        context = ntag_emu.action_context;
        ntag_emu.action = NULL;
    }
    CRITICAL_REGION_EXIT();
    if (action) action(context);
}

ret_code_t ntag_emu_init(const ntag_t *ntag) {
    uint32_t err_code;

    ntag_emu_set_update_cb(NULL, NULL);
    hal_nfc_stop();
    ntag_emu.field_on = false;

    err_code = hal_nfc_setup(nfc_callback, NULL);
    APP_ERROR_CHECK(err_code);

    ntag_emu_set_tag(ntag);
    err_code = hal_nfc_start();
    APP_ERROR_CHECK(err_code);
    return NRF_SUCCESS;
}

void ntag_emu_uninit(void) {
    ntag_emu_set_update_cb(NULL, NULL);
    hal_nfc_stop();
    ntag_emu.field_on = false;
}

void ntag_emu_set_tag(const ntag_t *ntag) {
    if (!ntag) return;
    ntag_emu_prepare_change();
    CRITICAL_REGION_ENTER();
    if (ntag != &ntag_emu.ntag) memcpy(&(ntag_emu.ntag), ntag, sizeof(ntag_t));
    ntag_emu.dirty = false;
    ++ntag_emu.generation;
    ntag_emu.pending = false;
    ntag_emu.sector = 0;
    ntag_emu.is_selecting_sector = 0;
    ntag_emu_set_uuid_only(&ntag_emu.ntag);
    ntag_emu.paused = false;
    CRITICAL_REGION_EXIT();
}

void ntag_emu_set_uuid_only(const ntag_t *ntag) {
    uint8_t uid1[7];
    if (ntag->type == NTAG_I2C_PLUS_2K) {
        // i really don't understand why this is different
        // but we need to present the id bytes directly here
        // *without* the bcc0/bcc1 bytes, these are NOT valid for this tag type
        uid1[0] = ntag->data[0];
        uid1[1] = ntag->data[1];
        uid1[2] = ntag->data[2];
        uid1[3] = ntag->data[3];
        uid1[4] = ntag->data[4];
        uid1[5] = ntag->data[5];
        uid1[6] = ntag->data[6];
    } else {
        uid1[0] = ntag->data[0];
        uid1[1] = ntag->data[1];
        uid1[2] = ntag->data[2];
        uid1[3] = ntag->data[4];
        uid1[4] = ntag->data[5];
        uid1[5] = ntag->data[6];
        uid1[6] = ntag->data[7];
    }

    hal_nfc_parameter_set(NFC_T2T_PARAM_NFCID1, uid1, sizeof(uid1));
}
