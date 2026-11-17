#include "app_settings.h"
#include "i18n/language.h"
#include "mini_app_launcher.h"
#include "settings_scene.h"
#include "settings_device_info.h"
#include "utils2.h"
#include "version2.h"
#include "ble_main.h"
#include "ble_remote.h"

#if defined(BOARD_OLED) && defined(PIXL_RUNTIME_DIAGNOSTICS)
/* Read the same local permission and radio state used by the remote transport.
 * An established GAP link may still be waiting for NUS notifications. */
static const char *device_test_remote_status(bool de) {
    if (!ble_remote_enabled()) return de ? "Remote: aus" : "Remote: off";
    if (!ble_remote_mode_active() || ble_mode_transition_pending())
        return de ? "Remote: wartet" : "Remote: waiting";
    switch (ble_status_state_get()) {
    case BLE_LINK_ADVERTISING: return "BLE: Pixl.Remote";
    case BLE_LINK_CONNECTED: return de ? "Remote: verbunden" : "Remote: connected";
    case BLE_LINK_HOST_CONNECTED: return de ? "Remote: nur Link" : "Remote: link only";
    case BLE_LINK_DISCONNECTING: return de ? "Remote: trennt" : "Remote: closing";
    default: return de ? "Remote: inaktiv" : "Remote: idle";
    }
}

static void device_test_draw(mui_view_t *view, mui_canvas_t *canvas) {
    app_settings_t *app = view->user_data;
    bool de = getLanguage() == LANGUAGE_DE_DE;
    char text[28];

    mui_canvas_set_font(canvas, MUI_FONT_NORMAL);
    /* Distinct inner-corner marks, clockwise from top left: a horizontal
     * line, a vertical line, a square and a single pixel. */
    mui_canvas_draw_box(canvas, 1, 1, 3, 1);
    mui_canvas_draw_box(canvas, 126, 1, 1, 3);
    mui_canvas_draw_box(canvas, 125, 61, 2, 2);
    mui_canvas_draw_dot(canvas, 1, 62);
    mui_canvas_draw_utf8(canvas, 4, 11, "OLED / SH1106");
    for (uint8_t x = 101; x < 106; x += 2)
        mui_canvas_draw_box(canvas, x, 4, 1, 7);
    for (uint8_t y = 0; y < 8; ++y)
        for (uint8_t x = y & 1; x < 8; x += 2)
            mui_canvas_draw_dot(canvas, 107 + x, 4 + y);
    /* A T on clear and solid backgrounds checks both pixel polarities. */
    mui_canvas_draw_box(canvas, 116, 5, 3, 1);
    mui_canvas_draw_box(canvas, 117, 6, 1, 4);
    mui_canvas_draw_box(canvas, 120, 4, 5, 7);
    uint8_t color = mui_canvas_get_draw_color(canvas);
    mui_canvas_set_draw_color(canvas, 0);
    mui_canvas_draw_box(canvas, 121, 5, 3, 1);
    mui_canvas_draw_box(canvas, 122, 6, 1, 4);
    mui_canvas_set_draw_color(canvas, color);
    snprintf(text, sizeof(text), "ID %.12s", version_get_source_id());
    mui_canvas_draw_utf8(canvas, 4, 23, text);
    mui_canvas_draw_utf8(canvas, 4, 35, device_test_remote_status(de));

    const char *labels[] = {de ? "Links" : "Left", de ? "Mitte" : "Center", de ? "Rechts" : "Right"};
    for (uint8_t k = INPUT_KEY_LEFT; k <= INPUT_KEY_RIGHT; ++k) {
        uint8_t x = 4 + 41 * k;
        mui_canvas_draw_utf8(canvas, x, 47, labels[k]);
        if (app->tested_keys & (1u << k))
            mui_canvas_draw_box(canvas, x, 49, 32, app->held_keys & (1u << k) ? 3 : 1);
    }
    mui_canvas_draw_utf8(canvas, 4, 60, de ? "Mitte halten: zurück" : "Hold center: back");
    mui_canvas_draw_rframe(canvas, 0, 0, 128, 64, 0);
}

static void device_test_input(mui_view_t *view, mui_input_event_t *event) {
    app_settings_t *app = view->user_data;
    if ((unsigned)event->key > INPUT_KEY_RIGHT) return;
    uint8_t bit = 1u << event->key;
    if (event->type == INPUT_TYPE_PRESS) {
        app->tested_keys |= bit;
        app->held_keys |= bit;
    } else if (event->type == INPUT_TYPE_RELEASE) {
        app->held_keys &= ~bit;
    } else if (event->key == INPUT_KEY_CENTER && event->type == INPUT_TYPE_LONG) {
        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, SETTINGS_VIEW_ID_MAIN);
    }
}

void settings_device_test_open(app_settings_t *app) {
    app->tested_keys = app->held_keys = 0;
    app->device_test = (mui_view_t){.user_data = app, .draw_cb = device_test_draw,
                                    .input_cb = device_test_input};
    mui_view_dispatcher_add_view(app->p_view_dispatcher, SETTINGS_VIEW_ID_DEVICE_TEST, &app->device_test);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, SETTINGS_VIEW_ID_DEVICE_TEST);
}
#endif

static void settings_scene_version_list_view_on_selected(mui_list_view_event_t event, mui_list_view_t *p_list_view,
                                                         mui_list_item_t *p_item) {
    app_settings_t *app = p_list_view->user_data;
    mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
}

void settings_scene_version_on_enter(void *user_data) {

    app_settings_t *app = user_data;
    char txt[32];
    settings_device_info_format_text(txt, sizeof(txt), version_get_version(NULL));
    mui_list_view_add_item_ext(app->p_list_view, 0xe1c7, "Version", txt, (void *)0xFF);

    settings_device_info_format_text(txt, sizeof(txt), version_get_builddate(NULL));
    mui_list_view_add_item_ext(app->p_list_view, 0xe1c8, "BuildDate", txt, (void *)0xFF);

    settings_device_info_format_text(txt, sizeof(txt), version_get_githash(NULL));
    mui_list_view_add_item_ext(app->p_list_view, 0xe1c9, "GitHash", txt, (void *)0xFF);

    settings_device_info_format_text(txt, sizeof(txt), version_get_gitbranch(NULL));
    mui_list_view_add_item_ext(app->p_list_view, 0xe1ca, "Branch", txt, (void *)0xFF);

#if defined(LCD_SCREEN) && defined(LCD_ST7567)
    settings_device_info_format_text(txt, sizeof(txt), "LCD/ST7567");
#elif defined(OLED_SCREEN) && defined(OLED_SH1106)
    settings_device_info_format_text(txt, sizeof(txt), "OLED/SH1106");
#else
    snprintf(txt, sizeof(txt), "[%u]", (unsigned)version_get_target(NULL));
#endif
    mui_list_view_add_item_ext(app->p_list_view, 0xe1cb, _T(DE39_INFO_BUILD_TARGET), txt, (void *)0xFF);

    settings_device_info_format_chip(txt, sizeof(txt), NRF_FICR->INFO.PART);
    mui_list_view_add_item_ext(app->p_list_view, 0xe1cb, "Chip", txt, (void *)0xFF);

    settings_softdevice_info_t sd_info;
    bool sd_valid = settings_device_info_read_softdevice(&sd_info);
    if (sd_valid) {
        settings_device_info_format_softdevice(txt, sizeof(txt), &sd_info);
    } else {
        settings_device_info_format_text(txt, sizeof(txt), _T(DE39_INFO_UNKNOWN));
    }
    mui_list_view_add_item_ext(app->p_list_view, 0xe1cb, "SoftDevice", txt, (void *)0xFF);

    if (sd_valid) {
        snprintf(txt, sizeof(txt), "[0x%04X]", (unsigned)sd_info.fwid);
    } else {
        settings_device_info_format_text(txt, sizeof(txt), _T(DE39_INFO_UNKNOWN));
    }
    mui_list_view_add_item_ext(app->p_list_view, 0xe1cb, "SD-FWID", txt, (void *)0xFF);

    snprintf(txt, sizeof(txt), "[%u]", (unsigned)version_get_dirty_flag(NULL));
    mui_list_view_add_item_ext(app->p_list_view, 0xe1cc, "Dirty", txt, (void *)0xFF);

    snprintf(txt, sizeof(txt), "[%.12s]", version_get_source_id());
    mui_list_view_add_item_ext(app->p_list_view, 0xe1c9, "Source-ID", txt, (void *)0xFF);

    mui_list_view_add_item(app->p_list_view, 0xe1cd, getLangString(_L_BACK), (void *)0);

    mui_list_view_set_selected_cb(app->p_list_view, settings_scene_version_list_view_on_selected);

    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, SETTINGS_VIEW_ID_MAIN);
}

void settings_scene_version_on_exit(void *user_data) {
    app_settings_t *app = user_data;
    mui_list_view_clear_items(app->p_list_view);
    mui_list_view_set_selected_cb(app->p_list_view, NULL);
}
