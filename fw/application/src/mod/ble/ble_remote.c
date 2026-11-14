#include "ble_remote.h"
#include "ble_remote_protocol.h"
#include "ble_main.h"
#include "ble_work.h"
#include "app_timer.h"
#include "app_util_platform.h"
#include "mini_app_launcher.h"
#include "mini_app_registry.h"
#include "mui_core.h"
#include "mui_mem.h"
#include "ntag_emu.h"
#include "nrf.h"
#include "nrf_error.h"
#include "nrf_pwr_mgmt.h"
#include "vfs_packed_runtime.h"
#include <string.h>

static ble_remote_protocol_t protocol;
static volatile uint32_t local_generation;
static bool permission, dispatching, handoff_requested, handoff_armed, file_link_requested;
static uint32_t handoff_local, handoff_tick, handoff_link;

#ifdef BOARD_LCD
/* A copy is only held while a user-requested photo is in progress. Both
 * rendering and copying run on the foreground loop with radio IRQs enabled. */
static uint8_t *lcd_frame;
static uint16_t lcd_next;
static uint32_t lcd_last_tick;
static void lcd_release(void) {
    if (lcd_frame) mui_mem_free(lcd_frame);
    lcd_frame = NULL;
    lcd_next = 0;
}
static uint8_t lcd_read(uint8_t index) {
    const size_t frame_bytes = 1024u;
    size_t offset = (size_t)index * 8u;
    size_t capacity = ble_nus_max_data_length();
    if (capacity < REMOTE_REPLY_SIZE + 8u) return REMOTE_UNSUPPORTED;
    if (index == 0) {
        mui_t *ui = mui();
        if (!ui || !ui->initialized || ui->memory_error ||
            u8g2_GetBufferTileHeight(&ui->u8g2) != 8 || u8g2_GetBufferTileWidth(&ui->u8g2) != 16) {
            lcd_release();
            return REMOTE_BUSY;
        }
        const uint8_t *pixels = u8g2_GetBufferPtr(&ui->u8g2);
        if (!pixels) { lcd_release(); return REMOTE_BUSY; }
        if (!lcd_frame) lcd_frame = mui_mem_malloc(frame_bytes);
        if (!lcd_frame) return REMOTE_NO_MEMORY;
        memcpy(lcd_frame, pixels, frame_bytes);
    } else if (!lcd_frame || offset != lcd_next) {
        return REMOTE_INVALID;
    }
    size_t count = (capacity - REMOTE_REPLY_SIZE) & ~(size_t)7u;
    if (count > REMOTE_LCD_CHUNK_MAX) count = REMOTE_LCD_CHUNK_MAX;
    if (count > frame_bytes - offset) count = frame_bytes - offset;
    memcpy(protocol.reply + REMOTE_REPLY_SIZE, lcd_frame + offset, count);
    protocol.reply[11] = (uint8_t)count;
    lcd_next = (uint16_t)(offset + count);
    lcd_last_tick = app_timer_cnt_get();
    if (lcd_next == frame_bytes) lcd_release();
    return REMOTE_DONE;
}
#endif

bool ble_remote_enabled(void) { return permission; }
bool ble_remote_dispatching(void) { return dispatching; }
bool ble_remote_response_pending(void) { return protocol.pending || protocol.replying; }
void ble_remote_local_activity(void) { local_generation++; }

bool ble_remote_set_enabled(bool enabled) {
    /* A synthetic key cannot grant itself permission, even through Settings. */
    if (dispatching) return false;
#ifdef BOARD_LCD
    lcd_release();
#endif
    permission = enabled;
    handoff_requested = handoff_armed = file_link_requested = false;
    local_generation++;
    return true;
}
void ble_remote_shutdown(void) {
#ifdef BOARD_LCD
    lcd_release();
#endif
    permission = false;
    handoff_requested = handoff_armed = file_link_requested = false;
    ble_remote_protocol_session(&protocol, ble_session_generation(), false);
}
static bool other_owner(void) {
    mini_app_launcher_t *launcher = mini_app_launcher();
    return mini_app_launcher_get_app_handle(launcher, MINI_APP_ID_BLE) ||
           mini_app_launcher_get_app_handle(launcher, MINI_APP_ID_AMIIBOLINK);
}
static bool safe_nfc(void) {
    /* Covers the independent Chameleon NFCT owner as well as NTAG's dirty work. */
    return !(NRF_NFCT->FIELDPRESENT &
             (NFCT_FIELDPRESENT_FIELDPRESENT_Msk | NFCT_FIELDPRESENT_LOCKDETECT_Msk)) &&
           ntag_emu_remote_input_safe();
}
static bool ui_ready(void) {
    mui_t *m = mui();
    if (!m->initialized || !m->event_queue.events || !m->event_queue.dispatcher || m->memory_error)
        return false;
    bool pending = false;
    CRITICAL_REGION_ENTER();
    for (unsigned i = 0; i < m->event_queue.count; i++) {
        unsigned slot = (m->event_queue.head + i) % MAX_EVENT_MSG;
        if (m->event_queue.events[slot].id == MUI_EVENT_ID_INPUT) { pending = true; break; }
    }
    CRITICAL_REGION_EXIT();
    return !pending;
}
static uint8_t remote_state(void *context) {
    (void)context;
    if (!permission) return REMOTE_OFF;
    /* This prospective state is published only together with the atomic
     * transport commit in send(); backpressure has not changed owners yet. */
    if (file_link_requested) return REMOTE_FILE;
    if (handoff_requested || ble_mode_transition_pending()) return REMOTE_TRANSITION;
    if (mini_app_launcher_get_app_handle(mini_app_launcher(), MINI_APP_ID_BLE)) return REMOTE_FILE;
    return ble_remote_mode_active() ? REMOTE_ACTIVE : REMOTE_SUSPENDED;
}
static uint8_t execute(void *context, uint8_t op, uint8_t arg, uint32_t input_generation) {
    (void)context;
    if (!permission) return REMOTE_DISABLED;
    if (!ble_remote_transport_ready() || other_owner() || ble_mode_transition_pending()) return REMOTE_BUSY;
    if (op == REMOTE_STATUS) return REMOTE_DONE;
    if (handoff_requested || file_link_requested) return REMOTE_BUSY;
#ifdef BOARD_LCD
    if (op == REMOTE_LCD_READ) return lcd_read(arg);
#endif
    if (vfs_packed_recovery_required() || !safe_nfc()) return REMOTE_UNSAFE;
    if (!ui_ready()) return REMOTE_BUSY;
    bool claimed = false;
    CRITICAL_REGION_ENTER();
    if (input_generation == local_generation && ble_remote_transport_ready() &&
        ble_session_generation() == protocol.generation) {
        dispatching = true; claimed = true;
    }
    CRITICAL_REGION_EXIT();
    if (!claimed) return REMOTE_BUSY;
    uint8_t result = REMOTE_DONE;
    if (op == REMOTE_OPEN_FILE_LINK) {
        file_link_requested = true;
        handoff_local = input_generation;
        handoff_tick = app_timer_cnt_get();
    } else if (op == REMOTE_OPEN_FILE) {
        handoff_requested = true;
        handoff_local = local_generation;
        handoff_tick = app_timer_cnt_get();
        handoff_link = ble_link_generation();
        ble_hold_advertising_after_disconnect();
        result = REMOTE_REQUESTED;
    } else {
        mui_event_t event = {.id = MUI_EVENT_ID_INPUT,
            .arg_int = ((op == REMOTE_BACK ? INPUT_TYPE_LONG : INPUT_TYPE_SHORT) << 8) |
                       (op == REMOTE_BACK ? INPUT_KEY_CENTER : arg)};
        mui_input_tag_current_event(&event);
        /* Synchronous, once, after physical queue dispatch, with IRQs enabled. */
        mui_event_dispatch_now(&mui()->event_queue, &event);
    }
    dispatching = false;
    nrf_pwr_mgmt_feed();
    return result;
}
static int send(void *context, const uint8_t *data, size_t size) {
    (void)context;
    uint32_t result = NRF_ERROR_INVALID_STATE;
    CRITICAL_REGION_ENTER();
    if (ble_remote_transport_ready() && ble_session_generation() == protocol.generation) {
        bool opening = data[3] == (128u | REMOTE_OPEN_FILE_LINK) && data[6] == REMOTE_DONE;
        if (opening) {
            uint8_t failure = REMOTE_DONE;
            if (!file_link_requested || !permission || handoff_local != local_generation ||
                other_owner() || !ui_ready() || ble_mode_transition_pending() ||
                app_timer_cnt_diff_compute(app_timer_cnt_get(), handoff_tick) >= APP_TIMER_TICKS(10000))
                failure = REMOTE_BUSY;
            else if (vfs_packed_recovery_required() || !safe_nfc()) failure = REMOTE_UNSAFE;
            if (failure != REMOTE_DONE) {
                file_link_requested = false;
                protocol.reply[6] = failure;
                protocol.reply[7] = remote_state(NULL);
                memcpy(protocol.last_reply, protocol.reply, REMOTE_REPLY_SIZE);
                opening = false;
            }
        }
        result = opening ? ble_remote_open_file_link(data, size, protocol.generation)
                         : ble_nus_tx_data((void *)data, size);
    }
    CRITICAL_REGION_EXIT();
    return result == NRF_SUCCESS ? 0 : result == NRF_ERROR_RESOURCES ? 1 : 2;
}
static void sent(void *context, uint8_t op, uint8_t status) {
    (void)context;
    if (op == REMOTE_OPEN_FILE && status == REMOTE_REQUESTED && handoff_requested &&
        handoff_local == local_generation) {
        handoff_armed = true;
    }
    if (op == REMOTE_OPEN_FILE_LINK && status == REMOTE_DONE && file_link_requested) {
        file_link_requested = false;
        /* RX is already routed safely; main cannot dispatch queued file work
         * until this callback returns. Allocation failure closes that session. */
        dispatching = true;
        mini_app_launcher_run(mini_app_launcher(), MINI_APP_ID_BLE);
        dispatching = false;
        if (!mini_app_launcher_get_app_handle(mini_app_launcher(), MINI_APP_ID_BLE)) ble_disable();
    }
}
bool ble_remote_receive_irq(const uint8_t *data, size_t length) {
    if (!data || length != REMOTE_REQUEST_SIZE) {
        ble_work_disconnected(); /* Invalidate old commands before async GAP close. */
        return false;
    }
    uint8_t tagged[sizeof(uint32_t) + REMOTE_REQUEST_SIZE];
    bool accepted;
    CRITICAL_REGION_ENTER();
    uint32_t epoch = local_generation;
    memcpy(tagged, &epoch, sizeof(epoch));
    memcpy(tagged + sizeof(epoch), data, length);
    accepted = ble_work_receive(tagged, sizeof(tagged));
    CRITICAL_REGION_EXIT();
    return accepted;
}
void ble_remote_receive(const uint8_t *data, size_t length) {
    if (!data || length != sizeof(uint32_t) + REMOTE_REQUEST_SIZE) {
        ble_nus_abort_transfer(); return;
    }
    uint32_t input_generation;
    memcpy(&input_generation, data, sizeof(input_generation));
    uint32_t generation = ble_session_generation();
    bool active = permission && ble_remote_transport_ready();
    if (!active || !protocol.active || protocol.generation != generation) {
        file_link_requested = false;
#ifdef BOARD_LCD
        lcd_release();
#endif
    }
    ble_remote_protocol_session(&protocol, generation, active);
    if (!ble_remote_protocol_receive(&protocol, data + sizeof(input_generation), REMOTE_REQUEST_SIZE, input_generation))
        ble_nus_abort_transfer();
}
void ble_remote_poll(void) {
#ifdef BOARD_LCD
    if (lcd_frame && app_timer_cnt_diff_compute(app_timer_cnt_get(), lcd_last_tick) >= APP_TIMER_TICKS(30000))
        lcd_release();
#endif
    if (handoff_requested && (handoff_local != local_generation || !permission ||
        (ble_link_generation() != handoff_link && ble_link_generation() != handoff_link + 1u) ||
        app_timer_cnt_diff_compute(app_timer_cnt_get(), handoff_tick) >= APP_TIMER_TICKS(10000))) {
        handoff_requested = handoff_armed = false;
        if (permission) ble_release_advertising_hold();
    }
    uint32_t generation = ble_session_generation();
    bool active = permission && ble_remote_transport_ready();
    if (!active || !protocol.active || protocol.generation != generation) {
        file_link_requested = false;
#ifdef BOARD_LCD
        lcd_release();
#endif
    }
    ble_remote_protocol_session(&protocol, generation, active);
    if (!permission) {
        if (ble_remote_mode_owned()) ble_disable();
        return;
    }
    if (handoff_requested && !handoff_armed && !ble_is_connected()) {
        handoff_requested = false;
        ble_release_advertising_hold();
    }
    if (handoff_armed && ble_link_generation() == handoff_link + 1u &&
        ble_transport_idle() && !ble_mode_transition_pending()) {
        handoff_requested = handoff_armed = false;
        if (other_owner() || !ui_ready() || !safe_nfc() || vfs_packed_recovery_required()) {
            ble_release_advertising_hold(); return;
        }
        /* No retained application/view pointers cross a disconnect. */
        mini_app_launcher_run(mini_app_launcher(), MINI_APP_ID_BLE);
        if (!mini_app_launcher_get_app_handle(mini_app_launcher(), MINI_APP_ID_BLE))
            ble_release_advertising_hold();
        return;
    }
    if (active) {
        ble_remote_protocol_poll(&protocol, generation, local_generation, NULL, execute, remote_state, send, sent);
    } else if (!other_owner() && !ble_mode_transition_pending() && ble_transport_idle() &&
               !ble_remote_mode_active() && !vfs_packed_recovery_required()) {
        ble_init();
        ble_device_mode_prepare(BLE_DEVICE_MODE_REMOTE);
        ble_adv_start();
        ble_nus_set_handler(ble_remote_receive, NULL);
    }
}
