#include "mui_input.h"

#include "mui_core.h"
#include "mui_event.h"
#include "nrf_log.h"
#include "bsp_btn.h"
#include "ble_remote.h"

#include "cache.h"
#include "settings.h"
#include "boards.h"

/* Main context advances the token; the button ISR reads one aligned word.
 * Keep each debounced physical gesture's token through RELEASE then SHORT,
 * including when left/right mapping changes while the key is held. */
static volatile uint32_t input_context = 1;
static uint32_t button_context[BUTTONS_NUMBER];

static void *mui_input_context_token(uint32_t context) { return (void *)(uintptr_t)context; }

uint32_t mui_input_context_current(void) { return input_context; }

void mui_input_context_changed(void) {
    uint32_t next = input_context + 1u;
    input_context = next ? next : 1u;
}

void mui_input_tag_current_event(mui_event_t *event) {
    if (event) event->arg_ptr = mui_input_context_token(input_context);
}

bool mui_input_event_is_current(const mui_event_t *event) {
    return event && event->arg_ptr == mui_input_context_token(input_context);
}

static void mui_input_post_event(mui_input_event_t *p_input_event, uint32_t context) {
    uint32_t arg = p_input_event->type;
    arg <<= 8;
    arg += p_input_event->key;
    mui_event_t mui_event = {.id = MUI_EVENT_ID_INPUT, .arg_int = arg,
                             .arg_ptr = mui_input_context_token(context)};
    mui_post(mui(), &mui_event);
}


void mui_input_on_bsp_btn_event(uint8_t btn, bsp_btn_event_t evt) {
    ble_remote_local_activity();
    if (btn >= BUTTONS_NUMBER) return;
    if (evt == BSP_BTN_EVENT_PRESSED) button_context[btn] = input_context;
    uint32_t context = button_context[btn];
    // When enabled, mirror the left/right buttons (e.g. to match a device
    // held rotated 180 degrees).
    if (settings_get_data()->swap_buttons) {
        btn = (BUTTONS_NUMBER - 1) - btn;
    }

    switch (evt) {

    case BSP_BTN_EVENT_PRESSED: {
        NRF_LOG_DEBUG("Key %d pressed", btn);
        mui_input_event_t input_event = {.key = btn, .type = INPUT_TYPE_PRESS};
        mui_input_post_event(&input_event, context);
        break;
    }

    case BSP_BTN_EVENT_RELEASED: {
        NRF_LOG_DEBUG("Key %d released", btn);
        mui_input_event_t input_event = {.key = btn, .type = INPUT_TYPE_RELEASE};
        mui_input_post_event(&input_event, context);
        break;
    }

    case BSP_BTN_EVENT_SHORT: {
        NRF_LOG_DEBUG("Key %d short push", btn);
        mui_input_event_t input_event = {.key = btn,
                                         .type = INPUT_TYPE_SHORT};
        mui_input_post_event(&input_event, context);
        break;
    }

    case BSP_BTN_EVENT_LONG: {
        NRF_LOG_DEBUG("Key %d long push", btn);
        mui_input_event_t input_event = {.key = btn,
                                         .type = INPUT_TYPE_LONG};
        mui_input_post_event(&input_event, context);

        break;
    }

     case BSP_BTN_EVENT_REPEAT: {
        NRF_LOG_DEBUG("Key %d repeat push", btn);
        mui_input_event_t input_event = {.key = btn,
                                         .type = INPUT_TYPE_REPEAT};
        mui_input_post_event(&input_event, context);

        break;
    }

    default:
        break;
    }
}


void mui_input_init() {
    bsp_btn_init(mui_input_on_bsp_btn_event);
    
}

void mui_input_deinit(void) { bsp_btn_deinit(); }
