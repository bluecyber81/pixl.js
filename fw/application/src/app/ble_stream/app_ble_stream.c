/* Incoming display stream based on PR479. LCD integration keeps the existing
 * bounded BLE foreground queue, session generations and connection defaults. */
#include "app_ble_stream.h"
#include "stream_codec.h"
#include "app_timer.h"
#include "ble_main.h"
#include "i18n/language.h"
#include "mini_app_launcher.h"
#include "mini_app_registry.h"
#include "mui_include.h"
#include "nrf_error.h"
#include <stdio.h>
#include <string.h>

typedef struct {
    mui_view_dispatcher_t *p_view_dispatcher;
    mui_view_t *p_view;
    stream_codec_t codec;
    uint32_t generation, window_tick;
    uint16_t window_frames, fps;
    char address[20];
    int8_t rssi;
    uint8_t pending_ack;
    bool connected, has_rssi, show_hud, invert, chunk_ack;
} app_ble_stream_t;
static app_ble_stream_t *s_stream_app;

static const char *stream_tr(const char *de, const char *en) {
    return getLanguage() == LANGUAGE_DE_DE ? de : en;
}
static void stream_session(app_ble_stream_t *app) {
    uint32_t generation = ble_session_generation();
    if (app->generation == generation) return;
    app->generation = generation;
    stream_codec_reset(&app->codec);
    app->window_tick = app_timer_cnt_get();
    app->window_frames = app->fps = 0;
    app->has_rssi = false;
    app->chunk_ack = false;
    app->pending_ack = 0;
}
static void stream_flush_ack(void) {
    app_ble_stream_t *app = s_stream_app;
    if (!app) return;
    stream_session(app);
    if (!app->pending_ack) return;
    uint32_t result = app->pending_ack == 1 ? ble_nus_tx_data("ACK1\n", 5) :
                                              ble_nus_tx_data("OK\n", 3);
    if (result == NRF_ERROR_RESOURCES) return; /* Retry on actual TX-ready. */
    app->pending_ack = 0;
    if (result != NRF_SUCCESS) {
        stream_codec_reset(&app->codec);
        app->chunk_ack = false;
        ble_nus_abort_transfer();
    }
}
static void stream_link_changed(ble_link_state_t state) {
    app_ble_stream_t *app = s_stream_app;
    if (!app) return;
    stream_session(app);
    ble_get_addr_str(app->address);
    app->connected = state == BLE_LINK_CONNECTED;
    if (state == BLE_LINK_INACTIVE && !ble_mode_transition_pending())
        (void)ble_restart_advertising();
    mui_update(mui());
}
static void stream_on_ble_rx(const uint8_t *data, size_t length) {
    app_ble_stream_t *app = s_stream_app;
    if (!app) return;
    /* Called by ble_work_process in main, before the deferred UI observer.
     * A new session must clear its reference before its very first RX byte. */
    stream_session(app);
    /* Opt-in flow control for the supplied PC sender. Existing clients receive
     * only the original RSSI notifications. A reconnect always disables ACKs. */
    if (app->pending_ack) {
        /* A negotiated sender allows one outstanding chunk. Do not replace an
         * unsent acknowledgement and silently lose framing under backpressure. */
        stream_codec_reset(&app->codec);
        app->chunk_ack = false;
        app->pending_ack = 0;
        ble_nus_abort_transfer();
        return;
    }
    static const char hello[] = "PXSTREAM:ACK1\n";
    if (!app->codec.has_frame && app->codec.state == 0 &&
        length == sizeof(hello)-1 && !memcmp(data, hello, sizeof(hello)-1)) {
        app->chunk_ack = true;
        app->pending_ack = 1;
        stream_flush_ack();
        return;
    }
    unsigned frames = stream_codec_feed(&app->codec, data, length);
    if (app->chunk_ack) {
        app->pending_ack = 2;
        stream_flush_ack(); /* Required flow control takes priority over RSSI. */
    }
    if (frames) {
        app->connected = true;
        app->window_frames += frames;
        uint32_t now = app_timer_cnt_get();
        uint32_t elapsed = app_timer_cnt_diff_compute(now, app->window_tick);
        if (elapsed >= APP_TIMER_TICKS(1000)) {
            app->fps = (uint32_t)app->window_frames * APP_TIMER_TICKS(1000) / elapsed;
            app->window_frames = 0;
            app->window_tick = now;
            app->has_rssi = ble_stream_rssi(&app->rssi);
            if (app->has_rssi && !app->pending_ack) {
                char message[16];
                int n = snprintf(message, sizeof(message), "RSSI:%d\n", (int)app->rssi);
                if (n > 0 && (size_t)n < sizeof(message))
                    (void)ble_nus_tx_data(message, (size_t)n);
            }
        }
    }
    /* mui_update only marks dirty: rendering and decoding share foreground
     * ownership. No per-frame scheduler event or additional frame copy. */
    mui_update(mui());
}
static void stream_view_on_draw(mui_view_t *view, mui_canvas_t *canvas) {
    app_ble_stream_t *app = view->user_data;
    if (app->codec.has_frame) {
        mui_canvas_set_draw_color(canvas, 1);
        if (app->invert) {
            mui_canvas_draw_box(canvas, 0, 0, 128, 64);
            mui_canvas_set_draw_color(canvas, 0);
        }
        mui_canvas_draw_xbm(canvas, 0, 0, 128, 64, app->codec.frame);
        /* Display inversion never mutates the canonical delta reference. */
        mui_canvas_set_draw_color(canvas, 1);
        if (app->show_hud) {
            char text[32];
            mui_canvas_set_draw_color(canvas, 0);
            mui_canvas_draw_box(canvas, 0, 0, 128, 12);
            mui_canvas_set_draw_color(canvas, 1);
            mui_canvas_set_font(canvas, u8g2_font_wqy12_t_gb2312a);
            if (app->has_rssi) snprintf(text, sizeof(text), "%uFPS %ddBm %uB", app->fps, app->rssi, app->codec.last_payload);
            else snprintf(text, sizeof(text), "%uFPS %uB", app->fps, app->codec.last_payload);
            mui_canvas_draw_utf8(canvas, 2, 10, text);
        }
    } else {
        mui_canvas_set_font(canvas, u8g2_font_wqy12_t_gb2312a);
        mui_canvas_draw_utf8(canvas, 14, 14, _T(APP_BLE_STREAM));
        mui_canvas_draw_utf8(canvas, 12, 30, app->address);
        mui_canvas_draw_utf8(canvas, 2, 46, app->connected ? stream_tr("Warte auf Bild...", "Waiting for frame...") :
                                                           stream_tr("Warte auf Verbindung", "Waiting for BLE"));
        mui_canvas_draw_utf8(canvas, 2, 60, stream_tr("L:Info R:Inv M:Ende", "L:HUD R:Inv C:Exit"));
    }
}
static void stream_view_on_input(mui_view_t *view, mui_input_event_t *event) {
    if (event->type != INPUT_TYPE_SHORT && event->type != INPUT_TYPE_LONG) return;
    app_ble_stream_t *app = view->user_data;
    if (event->key == INPUT_KEY_CENTER) {
        mini_app_launcher_kill(mini_app_launcher(), MINI_APP_ID_BLE_STREAM);
        return;
    }
    if (event->key == INPUT_KEY_LEFT) app->show_hud = !app->show_hud;
    if (event->key == INPUT_KEY_RIGHT) app->invert = !app->invert;
    mui_update(mui());
}
static void app_ble_stream_on_run(mini_app_inst_t *inst) {
    app_ble_stream_t *app = mui_mem_malloc(sizeof(*app));
    if (!app) return;
    memset(app, 0, sizeof(*app));
    app->p_view = mui_view_create();
    if (!app->p_view) goto startup_failed;
    app->p_view_dispatcher = mui_view_dispatcher_create();
    if (!app->p_view_dispatcher) goto startup_failed;
    inst->p_handle = app;
    s_stream_app = app;
    app->generation = UINT32_MAX;
    app->p_view->user_data = app;
    app->p_view->draw_cb = stream_view_on_draw;
    app->p_view->input_cb = stream_view_on_input;
    mui_view_dispatcher_add_view(app->p_view_dispatcher, 0, app->p_view);
    mui_view_dispatcher_attach(app->p_view_dispatcher, MUI_LAYER_FULLSCREEN);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, 0);
    ble_init();
    ble_get_addr_str(app->address);
    ble_device_mode_prepare(BLE_DEVICE_MODE_PIXLJS);
    ble_nus_set_handler(stream_on_ble_rx, stream_flush_ack);
    ble_link_state_observe(stream_link_changed);
    ble_adv_start();
    return;
startup_failed:
    mui_view_dispatcher_free(app->p_view_dispatcher);
    mui_view_free(app->p_view);
    mui_mem_free(app);
}
static void app_ble_stream_on_kill(mini_app_inst_t *inst) {
    app_ble_stream_t *app = inst->p_handle;
    if (!app) return;
    ble_link_state_observe(NULL);
    ble_nus_set_handler(NULL, NULL);
    ble_disable();
    s_stream_app = NULL;
    mui_view_dispatcher_detach(app->p_view_dispatcher, MUI_LAYER_FULLSCREEN);
    mui_view_dispatcher_free(app->p_view_dispatcher);
    mui_view_free(app->p_view);
    mui_mem_free(app);
    inst->p_handle = NULL;
}
static void app_ble_stream_on_event(mini_app_inst_t *inst, mini_app_event_t *event) {
    (void)inst; (void)event;
}
const mini_app_t app_ble_stream_info = {
    .id = MINI_APP_ID_BLE_STREAM, .name = "BLE Stream", .name_i18n_key = _L_APP_BLE_STREAM,
    .icon = 0xe1b5, .deamon = false, .sys = false, .hibernate_enabled = false,
    .icon_32x32 = &app_ble_stream_32x32,
    .run_cb = app_ble_stream_on_run, .kill_cb = app_ble_stream_on_kill,
    .on_event_cb = app_ble_stream_on_event,
};
