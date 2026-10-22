#include "ble_df_driver.h"
#include "ble_main.h"
#include "ble_amiibolink.h"
#include "app_timer.h"
#include "nrf_log.h"
#include "nrf_log_ctrl.h"
#include "stddef.h"
#include <string.h>

static df_event_handler_t m_df_event_handler;
/* One bounded buffer serves RX reassembly and pending TX, never both. Keep
 * this within the existing RAM allocation on 64 KiB nRF52832 boards. */
static df_frame_t m_rx_df_frame;
static bool m_rx_active, m_tx_active, m_tx_more, m_framed_rx;
static uint8_t m_tx_sent;
static uint16_t m_rx_next_chunk, m_tx_next_chunk;
static uint32_t m_last_tick;
#define DF_FRAGMENT_TIMEOUT_TICKS APP_TIMER_TICKS(10000)

static void df_reset_transfer(void) {
    m_rx_active = m_tx_active = m_tx_more = m_framed_rx = false;
    m_rx_next_chunk = m_tx_next_chunk = m_tx_sent = 0;
    memset(&m_rx_df_frame, 0, sizeof(m_rx_df_frame));
}

static void df_abort_transfer(void) {
    df_reset_transfer();
    ble_nus_abort_transfer();
}

static bool df_check_timeout(void) {
    if ((m_rx_active || m_tx_active) &&
        app_timer_cnt_diff_compute(app_timer_cnt_get(), m_last_tick) >= DF_FRAGMENT_TIMEOUT_TICKS) {
        df_abort_transfer();
        return true;
    }
    return false;
}

void ble_df_driver_poll(void) { (void)df_check_timeout(); }
void ble_df_driver_enable_framed_rx(void) { m_framed_rx = true; }

static int32_t df_send_next(void) {
    size_t capacity = ble_nus_max_data_length();
    if (capacity < DF_HEADER_LEN) return -1;
    capacity -= DF_HEADER_LEN;
    if (capacity > DF_PAYLOAD_LEN) capacity = DF_PAYLOAD_LEN;
    if (m_rx_df_frame.length && !capacity) return -1;
    m_tx_sent = m_rx_df_frame.length < capacity ? m_rx_df_frame.length : capacity;
    bool more = m_tx_more || m_tx_sent < m_rx_df_frame.length;
    if (m_tx_next_chunk > 0x7fff || (more && m_tx_next_chunk == 0x7fff)) return -1;
    m_rx_df_frame.chunk = m_tx_next_chunk++ | (more ? 0x8000 : 0);
    m_last_tick = app_timer_cnt_get();
    return ble_nus_tx_data(&m_rx_df_frame, DF_HEADER_LEN + m_tx_sent);
}

int32_t df_ble_driver_init(df_event_handler_t cb) {
    m_df_event_handler = cb;
    df_reset_transfer();
    return 0;
}
int32_t df_ble_driver_send(df_frame_t *df) {
    if (!df || df->length > DF_PAYLOAD_LEN || m_rx_active || m_tx_active) return -1;
    size_t capacity = ble_nus_max_data_length();
    capacity = capacity > DF_HEADER_LEN ? capacity - DF_HEADER_LEN : 0;
    /* Existing file/directory handlers already segment their streams to the
     * negotiated capacity. Never renumber a stream midway if a link shrinks. */
    if (df->length > capacity && df->chunk != 0) return -1;
    m_tx_next_chunk = df->chunk & 0x7fff;
    m_tx_more = (df->chunk & 0x8000) != 0;
    if (df != &m_rx_df_frame) memcpy(&m_rx_df_frame, df, sizeof(m_rx_df_frame));
    m_tx_active = true;
    int32_t result = df_send_next();
    if (result) df_reset_transfer();
    return result;
}

df_driver_t ble_df_driver = {.init = df_ble_driver_init, .send = df_ble_driver_send};

df_driver_t *ble_get_df_driver() { return &ble_df_driver; }

void ble_on_received_data(const uint8_t *data, size_t length) {
    NRF_LOG_INFO("df_frame_size: %d", sizeof(m_rx_df_frame)); 
    NRF_LOG_INFO("ble data received %d bytes", length);
    //NRF_LOG_HEXDUMP_INFO(data, length);
    NRF_LOG_FLUSH();

    if (df_check_timeout()) return;
    if (data == NULL || length < DF_HEADER_LEN || length > DF_MAX_LEN || m_tx_active) {
        df_abort_transfer();
        return;
    }
    uint16_t chunk = (uint16_t)data[2] | ((uint16_t)data[3] << 8);
    bool more = (chunk & 0x8000) != 0;
    size_t payload = length - DF_HEADER_LEN;
    if (!m_framed_rx) {
        /* The old FILE_WRITE stream repeats its file-id in every packet and
         * writes each packet before the final acknowledgement. Do not reinterpret
         * those MORE bits as new transport fragments without explicit opt-in. */
        memset(&m_rx_df_frame, 0, sizeof(m_rx_df_frame));
        memcpy(&m_rx_df_frame, data, length);
        m_rx_df_frame.length = payload;
        if (m_df_event_handler) {
            df_event_t evt = {.df = &m_rx_df_frame, .type = DF_EVENT_DATA_RECEVIED};
            m_df_event_handler(&evt);
        }
        return;
    }

    if (data[1] != 0 || (chunk & 0x7fff) != m_rx_next_chunk ||
        (m_rx_active && data[0] != m_rx_df_frame.cmd) ||
        ((more || m_rx_active) && payload == 0) ||
        payload > DF_PAYLOAD_LEN - (m_rx_active ? m_rx_df_frame.length : 0)) {
        df_abort_transfer();
        return;
    }
    if (!m_rx_active) {
        m_rx_df_frame.cmd = data[0];
        m_rx_df_frame.status = 0;
        m_rx_df_frame.chunk = 0;
        m_rx_df_frame.length = 0;
    }
    memcpy(m_rx_df_frame.data + m_rx_df_frame.length, data + DF_HEADER_LEN, payload);
    m_rx_df_frame.length += payload;
    m_last_tick = app_timer_cnt_get();
    if (more) {
        /* A continuation must leave room for at least one more byte. */
        if (m_rx_df_frame.length == DF_PAYLOAD_LEN) { df_abort_transfer(); return; }
        m_rx_active = true;
        ++m_rx_next_chunk;
        return;
    }
    m_rx_active = false;
    m_rx_next_chunk = 0;
    if (m_df_event_handler) {
        df_event_t evt = {.df = &m_rx_df_frame, .type = DF_EVENT_DATA_RECEVIED};
        m_df_event_handler(&evt);
    }
}

void ble_on_disconnected(void) {
    ble_amiibolink_reset_transfer();
    if (m_df_event_handler) {
        df_event_t evt = {.type = DF_EVENT_LINK_DISCONNECTED, .df = NULL};
        m_df_event_handler(&evt);
    }
    df_reset_transfer();
}

void ble_on_transmit_ready() {
    NRF_LOG_INFO("ble  transmit ready!");
    if (!m_tx_active || df_check_timeout()) return;
    m_rx_df_frame.length -= m_tx_sent;
    if (m_rx_df_frame.length) {
        memmove(m_rx_df_frame.data, m_rx_df_frame.data + m_tx_sent, m_rx_df_frame.length);
        if (df_send_next() != 0) df_abort_transfer();
        return;
    }
    m_tx_active = false;
    if (m_df_event_handler) {
        df_event_t evt = {.type = DF_EVENT_DATA_TRANSMIT_READY};
        m_df_event_handler(&evt);
    }
}
