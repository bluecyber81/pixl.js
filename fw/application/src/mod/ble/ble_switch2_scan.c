/* S112 Timeslot receiver derived from PR479 (Aragamiz, b0ade162).
 * RADIO/TIMER0 access is confined to priority-0 timeslot callbacks. The
 * completion is drained from the existing foreground poll, never a lossy
 * scheduler event. State is released only after SESSION_CLOSED. */
#include "ble_main.h"

#include "app_timer.h"
#include "mui_mem.h"
#include "nrf.h"
#include "nrf_error.h"
#include "nrf_log.h"
#include "nrf_pwr_mgmt.h"
#include "nrf_sdh_soc.h"
#include "nrf_soc.h"

#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#define SCAN_SOC_OBSERVER_PRIO 1
#define SCAN_TIMESLOT_LEN_US   50000UL // 50 ms per slot
#define SCAN_RX_WINDOW_US      47000UL // 47 ms RX window (3 ms safety margin)
#define SCAN_REQ_TIMEOUT_US    100000UL

static const uint8_t k_adv_channels[3] = {37, 38, 39};
static const uint8_t k_adv_freqs[3] = {2, 26, 80}; // 2402, 2426, 2480 MHz

typedef struct {
    volatile bool stop, captured, closed;
    uint8_t channel;
    uint32_t started, duration;
    ble_switch2_scan_cb_t callback;
    ble_switch2_scan_result_t result;
    uint32_t rx_words[17]; /* DMA-aligned 68-byte RX buffer. */
    nrf_radio_signal_callback_return_param_t returned;
    nrf_radio_request_t request;
} switch2_scan_t;
static switch2_scan_t *m_scan;
#define m_scan_stop_req (m_scan->stop)
#define m_scan_captured (m_scan->captured)
#define m_scan_ch_idx (m_scan->channel)
#define m_scan_result (m_scan->result)
#define m_rx_buf ((uint8_t *)m_scan->rx_words)
#define m_ret_param (m_scan->returned)
#define m_timeslot_req (m_scan->request)

static void radio_stop_rx(void) {
    NRF_RADIO->SHORTS = 0;
    NRF_RADIO->INTENCLR = 0xFFFFFFFFUL;
    if (NRF_RADIO->STATE != RADIO_STATE_STATE_Disabled) {
        NRF_RADIO->EVENTS_DISABLED = 0;
        NRF_RADIO->TASKS_DISABLE = 1;
        /* Disable is normally a few microseconds. Never hold priority 0 in
         * an unbounded hardware wait; the slot retains a 3 ms margin. */
        for (unsigned wait = 0; wait < 1600 && NRF_RADIO->EVENTS_DISABLED == 0 &&
             NRF_RADIO->STATE != RADIO_STATE_STATE_Disabled; ++wait) { }

    }
    NRF_RADIO->EVENTS_DISABLED = 0;
    NRF_RADIO->EVENTS_END = 0;
    NRF_RADIO->EVENTS_READY = 0;
    NVIC_DisableIRQ(RADIO_IRQn);
    NVIC_ClearPendingIRQ(RADIO_IRQn);
}

static void timer0_stop(void) {
    NRF_TIMER0->TASKS_STOP = 1;
    NRF_TIMER0->INTENCLR = 0xFFFFFFFFUL;
    NRF_TIMER0->EVENTS_COMPARE[0] = 0;
    NVIC_DisableIRQ(TIMER0_IRQn);
    NVIC_ClearPendingIRQ(TIMER0_IRQn);
}

static void radio_start_ble_rx(uint8_t ch_idx) {
    uint8_t ch = k_adv_channels[ch_idx % 3];
    uint8_t freq = k_adv_freqs[ch_idx % 3];

    NRF_RADIO->POWER = 1;
    NRF_RADIO->SHORTS = 0;
    NRF_RADIO->INTENCLR = 0xFFFFFFFFUL;

    NRF_RADIO->MODE = (RADIO_MODE_MODE_Ble_1Mbit << RADIO_MODE_MODE_Pos);
    NRF_RADIO->FREQUENCY = freq;
    NRF_RADIO->DATAWHITEIV = ch;

    // BLE Advertising Access Address: 0x8E89BED6
    NRF_RADIO->BASE0 = 0x89BED600UL;
    NRF_RADIO->PREFIX0 = 0x0000008EUL;
    NRF_RADIO->RXADDRESSES = 0x01UL;

    NRF_RADIO->PCNF0 = (8UL << RADIO_PCNF0_LFLEN_Pos) |
                       (1UL << RADIO_PCNF0_S0LEN_Pos) |
                       (0UL << RADIO_PCNF0_S1LEN_Pos) |
                       (RADIO_PCNF0_PLEN_8bit << RADIO_PCNF0_PLEN_Pos);

    NRF_RADIO->PCNF1 = (64UL << RADIO_PCNF1_MAXLEN_Pos) |
                       (0UL << RADIO_PCNF1_STATLEN_Pos) |
                       (3UL << RADIO_PCNF1_BALEN_Pos) |
                       (RADIO_PCNF1_ENDIAN_Little << RADIO_PCNF1_ENDIAN_Pos) |
                       (RADIO_PCNF1_WHITEEN_Enabled << RADIO_PCNF1_WHITEEN_Pos);

    NRF_RADIO->CRCCNF = (RADIO_CRCCNF_LEN_Three << RADIO_CRCCNF_LEN_Pos) |
                        (RADIO_CRCCNF_SKIPADDR_Skip << RADIO_CRCCNF_SKIPADDR_Pos);
    NRF_RADIO->CRCPOLY = 0x00065BUL;
    NRF_RADIO->CRCINIT = 0x555555UL;

    NRF_RADIO->PACKETPTR = (uint32_t)(uintptr_t)m_rx_buf;

    NRF_RADIO->EVENTS_READY = 0;
    NRF_RADIO->EVENTS_ADDRESS = 0;
    NRF_RADIO->EVENTS_PAYLOAD = 0;
    NRF_RADIO->EVENTS_END = 0;
    NRF_RADIO->EVENTS_DISABLED = 0;

    NRF_RADIO->SHORTS = RADIO_SHORTS_READY_START_Msk | RADIO_SHORTS_END_DISABLE_Msk;
    NRF_RADIO->INTENSET = RADIO_INTENSET_DISABLED_Msk;

    NVIC_ClearPendingIRQ(RADIO_IRQn);
    NVIC_EnableIRQ(RADIO_IRQn);

    NRF_RADIO->TASKS_RXEN = 1;
}

static nrf_radio_signal_callback_return_param_t *radio_signal_cb(uint8_t signal_type) {
    m_ret_param.callback_action = NRF_RADIO_SIGNAL_CALLBACK_ACTION_NONE;
    m_ret_param.params.request.p_next = NULL;

    switch (signal_type) {
    case NRF_RADIO_CALLBACK_SIGNAL_TYPE_START:
        if (m_scan_stop_req || m_scan_captured) {
            m_ret_param.callback_action = NRF_RADIO_SIGNAL_CALLBACK_ACTION_END;
            break;
        }
        // Setup TIMER0 to end timeslot safely before deadline
        NRF_TIMER0->TASKS_STOP = 1;
        NRF_TIMER0->TASKS_CLEAR = 1;
        NRF_TIMER0->MODE = TIMER_MODE_MODE_Timer;
        NRF_TIMER0->BITMODE = TIMER_BITMODE_BITMODE_32Bit;
        NRF_TIMER0->PRESCALER = 4; // 1 MHz (1 us)
        NRF_TIMER0->CC[0] = SCAN_RX_WINDOW_US;
        NRF_TIMER0->EVENTS_COMPARE[0] = 0;
        NRF_TIMER0->INTENSET = TIMER_INTENSET_COMPARE0_Msk;
        NVIC_ClearPendingIRQ(TIMER0_IRQn);
        NVIC_EnableIRQ(TIMER0_IRQn);
        NRF_TIMER0->TASKS_START = 1;

        radio_start_ble_rx(m_scan_ch_idx);
        break;

    case NRF_RADIO_CALLBACK_SIGNAL_TYPE_RADIO:
        if (NRF_RADIO->EVENTS_DISABLED) {
            NRF_RADIO->EVENTS_DISABLED = 0;
            NRF_RADIO->EVENTS_END = 0;
            if (NRF_RADIO->CRCSTATUS == RADIO_CRCSTATUS_CRCSTATUS_CRCOk) {
                if (switch2_wake_parse_packet(m_rx_buf, sizeof(m_scan->rx_words), &m_scan_result)) {
                    m_scan_captured = true;
                    radio_stop_rx();
                    timer0_stop();
                    m_ret_param.callback_action = NRF_RADIO_SIGNAL_CALLBACK_ACTION_END;
                    break;
                }
            }
            if (!m_scan_stop_req && !m_scan_captured) {
                NRF_RADIO->TASKS_RXEN = 1;
            }
        }
        break;

    case NRF_RADIO_CALLBACK_SIGNAL_TYPE_TIMER0:
        radio_stop_rx();
        timer0_stop();
        m_scan_ch_idx = (uint8_t)((m_scan_ch_idx + 1) % 3);
        m_ret_param.callback_action = NRF_RADIO_SIGNAL_CALLBACK_ACTION_END;
        break;

    case NRF_RADIO_CALLBACK_SIGNAL_TYPE_EXTEND_FAILED:
    case NRF_RADIO_CALLBACK_SIGNAL_TYPE_EXTEND_SUCCEEDED:
    default:
        break;
    }

    return &m_ret_param;
}

static uint32_t request_next_timeslot(void) {
    memset(&m_timeslot_req, 0, sizeof(m_timeslot_req));
    m_timeslot_req.request_type = NRF_RADIO_REQ_TYPE_EARLIEST;
    m_timeslot_req.params.earliest.hfclk = NRF_RADIO_HFCLK_CFG_XTAL_GUARANTEED;
    m_timeslot_req.params.earliest.priority = NRF_RADIO_PRIORITY_NORMAL;
    m_timeslot_req.params.earliest.length_us = SCAN_TIMESLOT_LEN_US;
    m_timeslot_req.params.earliest.timeout_us = SCAN_REQ_TIMEOUT_US;
    return sd_radio_request(&m_timeslot_req);
}

static bool scan_expired(void) {
    return app_timer_cnt_diff_compute(app_timer_cnt_get(), m_scan->started) >= m_scan->duration;
}
static void scan_close(void) {
    m_scan->stop = true;
    (void)sd_radio_session_close();
    /* BUSY means closure is already pending. Only CLOSED releases ownership. */
}
static void scan_soc_evt_handler(uint32_t event, void *context) {
    (void)context;
    if (!m_scan || m_scan->closed) return;
    switch (event) {
    case NRF_EVT_RADIO_SESSION_IDLE:
    case NRF_EVT_RADIO_BLOCKED:
    case NRF_EVT_RADIO_CANCELED:
        if (m_scan->captured || m_scan->stop || scan_expired()) scan_close();
        else {
            nrf_pwr_mgmt_feed();
            if (request_next_timeslot() != NRF_SUCCESS) scan_close();
        }
        break;
    case NRF_EVT_RADIO_SIGNAL_CALLBACK_INVALID_RETURN:
        scan_close();
        break;
    case NRF_EVT_RADIO_SESSION_CLOSED:
        m_scan->closed = true;
        break;
    default: break;
    }
}
NRF_SDH_SOC_OBSERVER(m_switch2_scan_soc_observer, SCAN_SOC_OBSERVER_PRIO, scan_soc_evt_handler, NULL);

uint32_t ble_switch2_scan_start(uint16_t seconds, ble_switch2_scan_cb_t callback) {
    if (m_scan || ble_raw_adv_is_active() || ble_mode_transition_pending() || !ble_transport_idle())
        return NRF_ERROR_BUSY;
    if (seconds > 60) return NRF_ERROR_INVALID_PARAM;
    ble_init();
    ble_disable();
    switch2_scan_t *state = mui_mem_malloc(sizeof(*state));
    if (!state) return NRF_ERROR_NO_MEM;
    memset(state, 0, sizeof(*state));
    state->started = app_timer_cnt_get();
    state->duration = APP_TIMER_TICKS((seconds ? seconds : 15) * 1000u);
    state->callback = callback;
    m_scan = state;
    uint32_t result = sd_radio_session_open(radio_signal_cb);
    if (result != NRF_SUCCESS) {
        m_scan = NULL;
        mui_mem_free(state);
        return result;
    }
    result = request_next_timeslot();
    if (result != NRF_SUCCESS) {
        state->callback = NULL;
        scan_close();
        return result;
    }
    nrf_pwr_mgmt_feed();
    return NRF_SUCCESS;
}
void ble_switch2_scan_stop(void) {
    if (!m_scan) return;
    m_scan->callback = NULL;
    if (!m_scan->closed) scan_close();
}
bool ble_switch2_scan_is_active(void) { return m_scan != NULL; }
void ble_switch2_scan_process(void) {
    if (!m_scan) return;
    if (!m_scan->closed) {
        if (!m_scan->stop && scan_expired()) scan_close();
        return;
    }
    switch2_scan_t *done = m_scan;
    m_scan = NULL;
    /* No late timeslot can touch done after SESSION_CLOSED. Detach before the
     * callback so a callback-triggered new scan cannot inherit old state. */
    if (done->callback) done->callback(done->captured, done->captured ? &done->result : NULL);
    mui_mem_free(done);
}
