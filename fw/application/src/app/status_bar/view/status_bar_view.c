#include "status_bar_view.h"
#include "bat.h"
#include "app_status_bar.h"
#include "i18n/language.h"
#include <stdio.h>

/* Five bounded original bitmaps: 13x11 pixels, 110 bytes total. Enum order. */
static const uint8_t ble_status_bitmap[5][22] = {
    /* Inactive: diagonal strike through the Bluetooth rune. */
    {0x80, 0x00, 0x88, 0x00, 0x58, 0x00, 0x2a, 0x00, 0x3c, 0x00, 0x18, 0x00, 0x1c, 0x00, 0x2a, 0x00, 0x1c, 0x00, 0x0a, 0x00, 0x01, 0x00},
    /* Visible: two radio waves. */
    {0x00, 0x00, 0x08, 0x04, 0x18, 0x08, 0x2a, 0x11, 0x1c, 0x12, 0x08, 0x12, 0x1c, 0x12, 0x2a, 0x11, 0x18, 0x08, 0x08, 0x04, 0x00, 0x00},
    /* NUS channel ready: solid dot. */
    {0x00, 0x00, 0x08, 0x00, 0x18, 0x00, 0x2a, 0x0e, 0x1c, 0x1f, 0x08, 0x1f, 0x1c, 0x1f, 0x2a, 0x0e, 0x18, 0x00, 0x08, 0x00, 0x00, 0x00},
    /* Physical link only: open dot. */
    {0x00, 0x00, 0x08, 0x00, 0x18, 0x00, 0x2a, 0x0e, 0x1c, 0x11, 0x08, 0x11, 0x1c, 0x11, 0x2a, 0x0e, 0x18, 0x00, 0x08, 0x00, 0x00, 0x00},
    /* Closing or switching owner: minus, never a ready dot. */
    {0x00, 0x00, 0x08, 0x00, 0x18, 0x00, 0x2a, 0x00, 0x1c, 0x00, 0x08, 0x1f, 0x1c, 0x1f, 0x2a, 0x00, 0x18, 0x00, 0x08, 0x00, 0x00, 0x00},
};

static void chrg_callback(void) {
    mui_update(mui());
}

static void status_bar_view_on_draw(mui_view_t *p_view, mui_canvas_t *p_canvas) {
    mui_canvas_set_font(p_canvas, u8g2_font_siji_t_6x10);

    if (get_stats()) {
        mui_canvas_draw_glyph(p_canvas, 100, 8, 0xe09e);
    }

    status_bar_view_t *view = p_view->user_data;
    unsigned int state = (unsigned int)view->link_state;
    if (state > BLE_LINK_DISCONNECTING) state = BLE_LINK_INACTIVE;
    mui_canvas_draw_xbm(p_canvas, 0, 0, 13, 11, ble_status_bitmap[state]);

    uint8_t bt = bat_get_level();
    mui_canvas_draw_glyph(p_canvas, 110, 8, 0xe24c + bt);

    char voltage[32];
    if (bat_has_reading()) {
        unsigned int mv = bat_get_voltage_mv();
        snprintf(voltage, sizeof(voltage), "%u.%02uV%s%s", mv / 1000, (mv % 1000) / 10,
                 bat_is_low() ? " " : "", bat_is_low() ? getLangString(_L_DE3_BAT_LOW) : "");
    } else {
        snprintf(voltage, sizeof(voltage), "--.--V");
    }
    mui_canvas_set_font(p_canvas, MUI_FONT_SMALL);
    /* Keep the charging and bar icons unobscured, including translated warnings. */
    mui_canvas_draw_utf8_truncate(p_canvas, 14, 9, 82, voltage);
}

static void status_bar_view_on_input(mui_view_t *p_view, mui_input_event_t *event) {}

static void status_bar_view_on_enter(mui_view_t *p_view) {}

static void status_bar_view_on_exit(mui_view_t *p_view) {}

status_bar_view_t *status_bar_view_create() {
    status_bar_view_t *p_status_bar_view = mui_mem_malloc(sizeof(status_bar_view_t));
    if (!p_status_bar_view) return NULL;
    memset(p_status_bar_view, 0, sizeof(status_bar_view_t));
    p_status_bar_view->link_state = ble_status_state_get();

    mui_view_t *p_view = mui_view_create();
    if (!p_view) { mui_mem_free(p_status_bar_view); return NULL; }
    p_view->user_data = p_status_bar_view;
    p_view->draw_cb = status_bar_view_on_draw;
    p_view->input_cb = status_bar_view_on_input;
    p_view->enter_cb = status_bar_view_on_enter;
    p_view->exit_cb = status_bar_view_on_exit;

    chrg_set_callback(chrg_callback);

    p_status_bar_view->p_view = p_view;

    return p_status_bar_view;
}
void status_bar_view_set_link_state(status_bar_view_t *p_view, ble_link_state_t state) {
    if (!p_view) return;
    if ((unsigned int)state > BLE_LINK_DISCONNECTING) state = BLE_LINK_INACTIVE;
    if (p_view->link_state == state) return;
    p_view->link_state = state;
    mui_update(mui());
}

void status_bar_view_free(status_bar_view_t *p_view) {
    if (!p_view) return;
    chrg_set_callback(NULL);
    mui_view_free(p_view->p_view);
    mui_mem_free(p_view);
}
mui_view_t *status_bar_view_get_view(status_bar_view_t *p_view) { return p_view->p_view; }
