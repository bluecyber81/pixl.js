#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ntag_def.h"

typedef uint32_t ret_code_t;
typedef void (*ntag_update_cb_t)(void);
#define NRF_SUCCESS 0
#define NRF_ERROR_DATA_SIZE 1
#define NRF_ERROR_NULL 2
#define NRF_LOG_INFO(...) ((void)0)
#define APP_ERROR_CHECK(value) assert((value) == 0)
#define NFC_BUFFER_SIZE 255u
#define NFCT_TXD_FRAMECONFIG_PARITY_Parity 1u
#define NFCT_TXD_FRAMECONFIG_PARITY_Pos 0u
#define NFCT_TXD_FRAMECONFIG_DISCARDMODE_DiscardStart 1u
#define NFCT_TXD_FRAMECONFIG_DISCARDMODE_Pos 1u
#define NFCT_TXD_FRAMECONFIG_SOF_SoF 1u
#define NFCT_TXD_FRAMECONFIG_SOF_Pos 2u
#define NFCT_TXD_FRAMECONFIG_CRCMODETX_CRC16TX 1u
#define NFCT_TXD_FRAMECONFIG_CRCMODETX_Pos 3u
#define NFCT_MAXLEN_MAXLEN_Pos 0u
#define NFCT_MAXLEN_MAXLEN_Msk 255u
#define NFCT_TXD_AMOUNT_TXDATABYTES_Pos 0u
#define NFCT_TXD_AMOUNT_TXDATABYTES_Msk 255u
#define NFCT_INTENSET_TXFRAMEEND_Enabled 1u
#define NFCT_INTENSET_TXFRAMEEND_Pos 0u
static struct {
    uint32_t EVENTS_TXFRAMEEND, PACKETPTR, MAXLEN, INTENSET, TASKS_STARTTX;
    struct { uint32_t FRAMECONFIG, AMOUNT; } TXD;
} registers;
#define NRF_NFCT (&registers)
static volatile uint8_t m_nfc_buffer[NFC_BUFFER_SIZE];
static unsigned tx_calls, passive_calls;
static int ack;
static void nrf_nfct_event_clear(uint32_t *event) { *event = 0; ++tx_calls; }
static void nrf_pwr_mgmt_feed(void) {}
static void hal_send_ack_nack(uint8_t value) { ack = value; }
static uint32_t hal_nfc_passive_ack(void) { ++passive_calls; return 0; }

/* ACTUAL_NFC_FUNCTIONS */

static void reset_io(void) {
    memset(&registers, 0, sizeof(registers));
    memset((void *)m_nfc_buffer, 0xa5, sizeof(m_nfc_buffer));
    tx_calls = passive_calls = 0;
    ack = -1;
}
static uint8_t *new_tag(ntag_type_t type) {
    memset(&ntag_emu, 0, sizeof(ntag_emu));
    ntag_emu.ntag.type = type;
    size_t size = _ntag_data_size(&ntag_emu.ntag);
    uint8_t *data = malloc(size);
    assert(data);
    for (size_t i = 0; i < size; ++i) data[i] = (uint8_t)i;
    return data;
}
static void expect_nack(const uint8_t *frame, size_t length, uint8_t *data) {
    uint8_t before[NTAG_I2C_2K_DATA_SIZE];
    size_t size = _ntag_data_size(&ntag_emu.ntag);
    memcpy(before, data, size);
    reset_io(); ntag_emu.dirty = false;
    nfc_received_process(frame, length, data);
    assert(ack == 0 && tx_calls == 0 && !ntag_emu.dirty);
    assert(memcmp(before, data, size) == 0);
}
static void choose_sector(uint8_t sector, uint8_t *data) {
    uint8_t first[] = {NFC_CMD_SECTOR_SELECT, 0xff};
    uint8_t second[] = {sector, 0, 0, 0};
    reset_io();
    nfc_received_process(first, sizeof(first), data);
    assert(ack == 0xa && ntag_emu.is_selecting_sector);
    reset_io();
    nfc_received_process(second, sizeof(second), data);
    assert(ack == -1 && passive_calls == 1 && tx_calls == 0);
    assert(ntag_emu.sector == sector && !ntag_emu.is_selecting_sector);
}

int main(void) {
    // The real HAL must copy only the source payload, preserving the unused tail.
    uint8_t tiny[] = {1, 2, 3, 4};
    reset_io();
    assert(hal_nfc_send(tiny, sizeof(tiny)) == 0 && tx_calls == 1);
    assert(registers.TXD.AMOUNT == 4 && memcmp((const void *)m_nfc_buffer, tiny, 4) == 0);
    for (size_t i = 4; i < NFC_BUFFER_SIZE; ++i) assert(m_nfc_buffer[i] == 0xa5);
    assert(hal_nfc_send(NULL, 4) == NRF_ERROR_NULL);
    assert(hal_nfc_send(tiny, 0) == NRF_ERROR_DATA_SIZE);
    assert(hal_nfc_send(tiny, 256) == NRF_ERROR_DATA_SIZE);
    uint8_t maximum[255] = {0};
    assert(hal_nfc_send(maximum, sizeof(maximum)) == 0);

    uint8_t *data = new_tag(NTAG_215);
    const uint8_t minimum[][2] = {{NFC_CMD_READ,2},{NFC_CMD_WRITE,6},{N2_CMD_WRITE,7},
        {NFC_CMD_FAST_READ,3},{N2_CMD_FAST_READ,4},{NFC_CMD_PWD_AUTH,5},
        {N2_CMD_FAST_WRITE,4},{NFC_CMD_FAST_WRITE,3}};
    for (size_t i = 0; i < sizeof(minimum) / sizeof(minimum[0]); ++i) {
        for (size_t length = 0; length < minimum[i][1]; ++length) {
            uint8_t *frame = length ? calloc(length, 1) : NULL;
            if (length) frame[0] = minimum[i][0];
            expect_nack(frame, length, data);
            free(frame);
        }
    }
    uint8_t version[] = {NFC_CMD_GET_VERSION};
    reset_io(); nfc_received_process(version, 1, data);
    assert(tx_calls == 1 && registers.TXD.AMOUNT == 8 && m_nfc_buffer[6] == 0x11);
    uint8_t signature[] = {NFC_CMD_READ_SIG};
    reset_io(); nfc_received_process(signature, 1, data);
    assert(tx_calls == 1 && registers.TXD.AMOUNT == 32);
    uint8_t last_classic_read[] = {NFC_CMD_READ, 131};
    reset_io(); nfc_received_process(last_classic_read, 2, data);
    assert(registers.TXD.AMOUNT == 16 && memcmp((const void *)m_nfc_buffer, data + 524, 8) == 0);
    for (unsigned i = 8; i < 16; ++i) assert(m_nfc_buffer[i] == 0);
    for (unsigned page = 132; page <= 134; ++page) {
        uint8_t rollover[] = {NFC_CMD_READ, (uint8_t)page};
        reset_io(); nfc_received_process(rollover, 2, data);
        assert(registers.TXD.AMOUNT == 16 && ack == -1);
        for (unsigned i = 0; i < 16; ++i) {
            size_t offset = (page * 4 + i) % NTAG_DATA_SIZE;
            assert(m_nfc_buffer[i] == (offset >= 133 * 4 ? 0 : data[offset]));
        }
    }
    uint8_t invalid_read[] = {NFC_CMD_READ, 135};
    expect_nack(invalid_read, 2, data);
    /* NXP NTAG21x section 10.4: READ and FAST_READ both hide PWD/PACK.
     * Check every valid standard FAST_READ range, including the 252-byte
     * boundary and ranges straddling public/protected pages. */
    uint8_t classic_before[NTAG_DATA_SIZE];
    memcpy(classic_before, data, sizeof(classic_before));
    for (unsigned first = 0; first < NTAG_DATA_SIZE / 4; ++first) {
        for (unsigned last = first; last < NTAG_DATA_SIZE / 4 && last - first < 63; ++last) {
            uint8_t fast[] = {NFC_CMD_FAST_READ, (uint8_t)first, (uint8_t)last};
            size_t length = (last - first + 1) * 4;
            reset_io(); nfc_received_process(fast, sizeof(fast), data);
            assert(registers.TXD.AMOUNT == length && ack == -1);
            for (size_t i = 0; i < length; ++i) {
                size_t offset = first * 4 + i;
                assert(m_nfc_buffer[i] == (offset >= 133 * 4 ? 0 : data[offset]));
            }
            for (size_t i = length; i < NFC_BUFFER_SIZE; ++i) assert(m_nfc_buffer[i] == 0xa5);
            assert(memcmp(data, classic_before, sizeof(classic_before)) == 0);
        }
    }
    /* The proprietary N2 command retains its existing raw read semantics. */
    uint8_t n2_config[] = {N2_CMD_FAST_READ, 132, 134, 0};
    reset_io(); nfc_received_process(n2_config, sizeof(n2_config), data);
    assert(registers.TXD.AMOUNT == 12 && memcmp((const void *)m_nfc_buffer, data + 528, 12) == 0);
    uint8_t outside_classic[] = {NFC_CMD_FAST_READ, 134, 135};
    expect_nack(outside_classic, sizeof(outside_classic), data);
    uint8_t reversed[] = {NFC_CMD_FAST_READ, 10, 9};
    expect_nack(reversed, 3, data);
    uint8_t oversized[] = {NFC_CMD_FAST_READ, 0, 63};
    expect_nack(oversized, 3, data);
    uint8_t largest_read[] = {NFC_CMD_FAST_READ, 0, 62};
    reset_io(); nfc_received_process(largest_read, 3, data);
    assert(registers.TXD.AMOUNT == 252 && memcmp((const void *)m_nfc_buffer, data, 252) == 0);

    uint8_t write[] = {NFC_CMD_WRITE, 4, 0x21, 0x22, 0x23, 0x24};
    reset_io(); nfc_received_process(write, 6, data);
    assert(ack == 0xa && ntag_emu.dirty && memcmp(data + 16, write + 2, 4) == 0);
    write[1] = 2;
    reset_io(); nfc_received_process(write, 6, data);
    assert(data[8] == 8 && data[9] == 9 && data[10] == 0x23 && data[11] == 0x24);
    write[1] = 134;
    uint8_t last_config[4]; memcpy(last_config, data + 536, 4);
    reset_io(); nfc_received_process(write, 6, data);
    assert(ack == 0xa && memcmp(last_config, data + 536, 4) == 0);
    write[1] = 135; expect_nack(write, 6, data);
    write[1] = 4; ntag_emu.ntag.read_only = true; expect_nack(write, 6, data);
    ntag_emu.ntag.read_only = false;
    uint8_t n2_write[] = {N2_CMD_WRITE, 4, 7, 0x31, 0x32, 0x33, 0x34};
    reset_io(); nfc_received_process(n2_write, sizeof(n2_write), data);
    assert(ack == 0xa && memcmp(data + 16, n2_write + 3, 4) == 0);
    uint8_t n2_short[] = {N2_CMD_FAST_WRITE, 4, 7, 10};
    expect_nack(n2_short, sizeof(n2_short), data);
    uint8_t n2_overflow[20] = {N2_CMD_FAST_WRITE, 132, 7, 16};
    expect_nack(n2_overflow, sizeof(n2_overflow), data);
    uint8_t n2_fast[] = {N2_CMD_FAST_WRITE, 4, 7, 4, 0x41, 0x42, 0x43, 0x44};
    ntag_emu.ntag.read_only = true; expect_nack(n2_fast, sizeof(n2_fast), data);
    ntag_emu.ntag.read_only = false;
    reset_io(); nfc_received_process(n2_fast, sizeof(n2_fast), data);
    assert(ack == 0xa && memcmp(data + 16, n2_fast + 4, 4) == 0);
    free(data);

    data = new_tag(NTAG_I2C_PLUS_2K);
    uint8_t v3_same_pages[] = {NFC_CMD_FAST_READ, 132, 134};
    reset_io(); nfc_received_process(v3_same_pages, sizeof(v3_same_pages), data);
    assert(registers.TXD.AMOUNT == 12 && memcmp((const void *)m_nfc_buffer, data + 528, 12) == 0);
    reset_io(); nfc_received_process(version, 1, data);
    assert(registers.TXD.AMOUNT == 8 && m_nfc_buffer[6] == 0x15);
    uint8_t poll[] = {NFC_CMD_READ, 0xec};
    data[0xed * 4 + 2] = 0;
    reset_io(); nfc_received_process(poll, 2, data);
    assert(registers.TXD.AMOUNT == 16 && m_nfc_buffer[6] == 8 && data[0xed * 4 + 2] == 0);
    uint8_t fast_poll[] = {NFC_CMD_FAST_READ, 0xed, 0xed};
    reset_io(); nfc_received_process(fast_poll, 3, data);
    assert(registers.TXD.AMOUNT == 4 && m_nfc_buffer[2] == 8 && data[0xed * 4 + 2] == 0);
    // V3 SRAM writes remain acknowledged without overwriting the prepared response.
    uint8_t sram_write[67] = {NFC_CMD_FAST_WRITE, 0xf0, 0xff};
    uint8_t sram_before[64]; memcpy(sram_before, data + 0x3c0, 64);
    reset_io(); ntag_emu.dirty = false;
    nfc_received_process(sram_write, sizeof(sram_write), data);
    assert(ack == 0xa && !ntag_emu.dirty && memcmp(sram_before, data + 0x3c0, 64) == 0);

    choose_sector(1, data);
    uint8_t last_v3_read[] = {NFC_CMD_READ, 252};
    reset_io(); nfc_received_process(last_v3_read, 2, data);
    assert(registers.TXD.AMOUNT == 16 && memcmp((const void *)m_nfc_buffer, data + 2032, 16) == 0);
    last_v3_read[1] = 253; expect_nack(last_v3_read, 2, data);
    uint8_t last_v3_fast[] = {NFC_CMD_FAST_READ, 255, 255};
    reset_io(); nfc_received_process(last_v3_fast, 3, data);
    assert(registers.TXD.AMOUNT == 4 && memcmp((const void *)m_nfc_buffer, data + 2044, 4) == 0);
    write[1] = 255; reset_io(); nfc_received_process(write, 6, data);
    assert(ack == 0xa && memcmp(data + 2044, write + 2, 4) == 0);
    // Existing N2 bank-local addressing must not inherit a V3 sector offset.
    reset_io(); nfc_received_process(n2_fast, sizeof(n2_fast), data);
    assert(ack == 0xa && memcmp(data + 16, n2_fast + 4, 4) == 0);
    for (unsigned sector = 2; sector <= 255; sector += 253) {
        choose_sector((uint8_t)sector, data);
        last_v3_read[1] = 0; expect_nack(last_v3_read, 2, data);
        last_v3_fast[1] = last_v3_fast[2] = 0; expect_nack(last_v3_fast, 3, data);
        write[1] = 0; expect_nack(write, 6, data);
    }
    choose_sector(0, data);
    ntag_emu.is_selecting_sector = true;
    expect_nack(NULL, 0, data);
    assert(!ntag_emu.is_selecting_sector);
    free(data);

    // Deterministic bounded malformed traffic, with exact-sized heap frames for ASan.
    uint32_t seed = 12345;
    for (unsigned type = 0; type < 2; ++type) {
        data = new_tag((ntag_type_t)type);
        for (unsigned iteration = 0; iteration < 20000; ++iteration) {
            size_t length = iteration % 40;
            uint8_t *frame = length ? malloc(length) : NULL;
            for (size_t i = 0; i < length; ++i) {
                seed = seed * 1664525u + 1013904223u; frame[i] = (uint8_t)(seed >> 24);
            }
            reset_io(); nfc_received_process(frame, length, data); free(frame);
        }
        free(data);
    }
    puts("PASS NFC/HAL: classic/V3 boundaries, SRAM/sector semantics, short frames, read-only writes, 40000 fuzz frames");
    return 0;
}
