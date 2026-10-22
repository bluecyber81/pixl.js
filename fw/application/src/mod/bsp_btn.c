#include "bsp_btn.h"
#include "app_button.h"
#include "app_timer.h"
#include "bsp.h"
#include "nrf_log.h"
#include "nrf_pwr_mgmt.h"
#include "nrf_drv_gpiote.h"
#include "mui_nav_diag.h"

typedef enum { BTN_STATE_IDLE, BTN_STATE_PRESSED, BTN_STATE_LONG_PRESSED, BTN_STATE_REPEAT } btn_state_t;

#define BSP_BUTTON_LONG_PUSH_TIMEOUT_MS (1000)
#define BSP_BUTTON_REPEAT_PUSH_TIMEOUT_MS (200)

/* Stable storage also survives SDK stop requests that are still pending. */
APP_TIMER_DEF(m_button0_long);
APP_TIMER_DEF(m_button1_long);
APP_TIMER_DEF(m_button2_long);
APP_TIMER_DEF(m_button0_repeat);
APP_TIMER_DEF(m_button1_repeat);
APP_TIMER_DEF(m_button2_repeat);

typedef struct {
    btn_state_t state;
    uint8_t index;
    app_timer_id_t long_timer;
    app_timer_id_t repeat_timer;
} bsp_btn_t;

static bsp_btn_t m_bsp_btns[BUTTONS_NUMBER];
static bsp_btn_event_cb_t m_bsp_btn_event_cb;
static bool m_initialized;
static bool m_inputs_initialized;
static bool m_enabled;

static void bsp_button_event_handler(uint8_t pin_no, uint8_t button_action);

static const app_button_cfg_t app_buttons[BUTTONS_NUMBER] = {
    {BSP_BUTTON_0, false, BUTTON_PULL, bsp_button_event_handler},
    {BSP_BUTTON_1, false, BUTTON_PULL, bsp_button_event_handler},
    {BSP_BUTTON_2, false, BUTTON_PULL, bsp_button_event_handler},
};

static uint8_t bsp_button_pin_to_index(uint8_t pin_no) {
    for (uint32_t i = 0; i < BUTTONS_NUMBER; i++) {
        if (app_buttons[i].pin_no == pin_no) return i;
    }
    return 0xFF;
}

static void bsp_button_callback(bsp_btn_t *button, bsp_btn_event_t event) {
    if (m_enabled && m_bsp_btn_event_cb) {
        mui_nav_diag_raw(button->index, event);
        m_bsp_btn_event_cb(button->index, event);
    }
}

static void bsp_button_timer_stop(app_timer_id_t timer) {
    uint32_t result = app_timer_stop(timer);
    if (result != NRF_SUCCESS) NRF_LOG_WARNING("Button timer stop failed: %lu", (unsigned long)result);
}

static void button_long_push_timer_handler(void *p_context) {
    bsp_btn_t *button = p_context;
    if (!m_enabled || !button || button->state != BTN_STATE_PRESSED) return;
    button->state = BTN_STATE_LONG_PRESSED;
    nrf_pwr_mgmt_feed();
    bsp_button_callback(button, BSP_BTN_EVENT_LONG);
    /* The callback may disable input. Do not restart after deinit. */
    if (!m_enabled || button->state != BTN_STATE_LONG_PRESSED) return;
    uint32_t result = app_timer_start(button->repeat_timer,
                                     APP_TIMER_TICKS(BSP_BUTTON_REPEAT_PUSH_TIMEOUT_MS), button);
    if (result != NRF_SUCCESS) NRF_LOG_WARNING("Button repeat start failed: %lu", (unsigned long)result);
}

static void button_repeat_push_timer_handler(void *p_context) {
    bsp_btn_t *button = p_context;
    if (!m_enabled || !button ||
        (button->state != BTN_STATE_LONG_PRESSED && button->state != BTN_STATE_REPEAT)) return;
    button->state = BTN_STATE_REPEAT;
    nrf_pwr_mgmt_feed();
    bsp_button_callback(button, BSP_BTN_EVENT_REPEAT);
}

static void bsp_button_event_handler(uint8_t pin_no, uint8_t button_action) {
    uint8_t index = bsp_button_pin_to_index(pin_no);
    if (!m_enabled || index >= BUTTONS_NUMBER) return;
    bsp_btn_t *button = &m_bsp_btns[index];

    if (button_action == APP_BUTTON_PUSH) {
        if (button->state != BTN_STATE_IDLE) return;
        nrf_pwr_mgmt_feed();
        button->state = BTN_STATE_PRESSED;
        uint32_t result = app_timer_start(button->long_timer,
                                         APP_TIMER_TICKS(BSP_BUTTON_LONG_PUSH_TIMEOUT_MS), button);
        if (result != NRF_SUCCESS) NRF_LOG_WARNING("Button long start failed: %lu", (unsigned long)result);
        bsp_button_callback(button, BSP_BTN_EVENT_PRESSED);
    } else if (button_action == APP_BUTTON_RELEASE) {
        if (button->state == BTN_STATE_IDLE) return;
        nrf_pwr_mgmt_feed();
        btn_state_t previous = button->state;
        button->state = BTN_STATE_IDLE;
        bsp_button_timer_stop(button->long_timer);
        bsp_button_timer_stop(button->repeat_timer);
        bsp_button_callback(button, BSP_BTN_EVENT_RELEASED);
        if (previous == BTN_STATE_PRESSED) bsp_button_callback(button, BSP_BTN_EVENT_SHORT);
    }
}

void bsp_btn_deinit(void) {
    /* Pending callbacks become harmless before SDK input is disabled. */
    m_enabled = false;
    m_bsp_btn_event_cb = NULL;
    if (m_inputs_initialized) {
        uint32_t result = app_button_disable();
        if (result != NRF_SUCCESS) NRF_LOG_WARNING("Button disable failed: %lu", (unsigned long)result);
        for (uint32_t i = 0; i < BUTTONS_NUMBER; i++) nrf_drv_gpiote_in_uninit(app_buttons[i].pin_no);
        m_inputs_initialized = false;
    }
    if (!m_initialized) return;
    for (uint32_t i = 0; i < BUTTONS_NUMBER; i++) {
        m_bsp_btns[i].state = BTN_STATE_IDLE;
        bsp_button_timer_stop(m_bsp_btns[i].long_timer);
        bsp_button_timer_stop(m_bsp_btns[i].repeat_timer);
    }
}

void bsp_btn_init(bsp_btn_event_cb_t p_event_cb) {
    if (!m_initialized) {
        const app_timer_id_t long_timers[] = {m_button0_long, m_button1_long, m_button2_long};
        const app_timer_id_t repeat_timers[] = {m_button0_repeat, m_button1_repeat, m_button2_repeat};
        _Static_assert(BUTTONS_NUMBER == 3, "Button timer table must match the board");
        uint32_t result;
        for (uint32_t i = 0; i < BUTTONS_NUMBER; i++) {
            bsp_btn_t *button = &m_bsp_btns[i];
            button->index = i;
            button->long_timer = long_timers[i];
            button->repeat_timer = repeat_timers[i];
            result = app_timer_create(&button->long_timer, APP_TIMER_MODE_SINGLE_SHOT, button_long_push_timer_handler);
            APP_ERROR_CHECK(result);
            result = app_timer_create(&button->repeat_timer, APP_TIMER_MODE_REPEATED, button_repeat_push_timer_handler);
            APP_ERROR_CHECK(result);
        }
        m_initialized = true;
    } else bsp_btn_deinit();
    /* app_button_disable does not reset its private debounce states. Release
     * our GPIO inputs at deinit so init can reset those states without trying
     * to allocate an already-owned pin. Other GPIOTE users are untouched. */
    uint32_t result = app_button_init(app_buttons, BUTTONS_NUMBER, APP_TIMER_TICKS(50));
    APP_ERROR_CHECK(result);
    m_inputs_initialized = true;
    for (uint32_t i = 0; i < BUTTONS_NUMBER; i++) m_bsp_btns[i].state = BTN_STATE_IDLE;
    m_bsp_btn_event_cb = p_event_cb;
    m_enabled = true;
    result = app_button_enable();
    APP_ERROR_CHECK(result);
}
