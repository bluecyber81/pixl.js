#include "status_bar_view.h"
#include "bat.h"
#include "app_status_bar.h"
#include "i18n/language.h"
#include <string.h>

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

/* Each byte is one XBM row of a 6 x 9 glyph, least significant pixel first. */
static const uint8_t voltage_digits[10][9] = {
    {0x1e, 0x3f, 0x33, 0x33, 0x33, 0x33, 0x33, 0x3f, 0x1e}, /* 0 */
    {0x0c, 0x0e, 0x0f, 0x0c, 0x0c, 0x0c, 0x0c, 0x3f, 0x3f}, /* 1 */
    {0x1e, 0x3f, 0x30, 0x30, 0x1c, 0x0e, 0x03, 0x3f, 0x3f}, /* 2 */
    {0x1e, 0x3f, 0x30, 0x30, 0x1c, 0x30, 0x30, 0x3f, 0x1e}, /* 3 */
    {0x18, 0x1c, 0x1e, 0x1b, 0x1b, 0x3f, 0x3f, 0x18, 0x18}, /* 4 */
    {0x3f, 0x3f, 0x03, 0x1f, 0x3f, 0x30, 0x30, 0x3f, 0x1e}, /* 5 */
    {0x1c, 0x0e, 0x03, 0x1f, 0x3f, 0x33, 0x33, 0x3f, 0x1e}, /* 6 */
    {0x3f, 0x3f, 0x30, 0x18, 0x18, 0x0c, 0x0c, 0x06, 0x06}, /* 7 */
    {0x1e, 0x3f, 0x33, 0x33, 0x1e, 0x33, 0x33, 0x3f, 0x1e}, /* 8 */
    {0x1e, 0x3f, 0x33, 0x33, 0x3f, 0x3e, 0x30, 0x1c, 0x0e}, /* 9 */
};
static const uint8_t voltage_unit[9] = {0x33, 0x33, 0x33, 0x33, 0x33, 0x33, 0x1e, 0x1e, 0x0c};
static const uint8_t charging_bolt[9] = {0x30, 0x18, 0x1c, 0x0e, 0x7f, 0x38, 0x1c, 0x0c, 0x06};

static void draw_voltage(mui_canvas_t *canvas, bool valid) {
    if (valid) {
        uint16_t mv = bat_get_voltage_mv();
        if (mv >= 10000) mui_canvas_draw_xbm(canvas, 57, 1, 6, 9, voltage_digits[mv / 10000]);
        mui_canvas_draw_xbm(canvas, 64, 1, 6, 9, voltage_digits[(mv / 1000) % 10]);
        mui_canvas_draw_xbm(canvas, 74, 1, 6, 9, voltage_digits[(mv / 100) % 10]);
        mui_canvas_draw_xbm(canvas, 81, 1, 6, 9, voltage_digits[(mv / 10) % 10]);
    } else {
        mui_canvas_draw_box(canvas, 64, 5, 6, 2);
        mui_canvas_draw_box(canvas, 74, 5, 6, 2);
        mui_canvas_draw_box(canvas, 81, 5, 6, 2);
    }
    mui_canvas_draw_box(canvas, 71, 8, 2, 2);
    if (getLanguage() == LANGUAGE_DE_DE) mui_canvas_draw_box(canvas, 71, 10, 1, 1);
    mui_canvas_draw_xbm(canvas, 90, 1, 6, 9, voltage_unit);
}

static void draw_battery(mui_canvas_t *canvas, bool valid) {
    mui_canvas_draw_box(canvas, 100, 1, 25, 1);
    mui_canvas_draw_box(canvas, 100, 10, 25, 1);
    mui_canvas_draw_box(canvas, 99, 2, 1, 8);
    mui_canvas_draw_box(canvas, 125, 2, 1, 8);
    mui_canvas_draw_box(canvas, 126, 4, 2, 4);
    if (valid) {
        uint8_t level = bat_get_level();
        for (uint8_t i = 0; i < level && i < 8; ++i)
            mui_canvas_draw_box(canvas, 101 + 3 * i, 3, 2, 6);
    } else {
        mui_canvas_draw_box(canvas, 109, 5, 7, 2);
    }
}

static void status_bar_view_on_draw(mui_view_t *p_view, mui_canvas_t *p_canvas) {
    status_bar_view_t *view = p_view->user_data;
    unsigned int state = (unsigned int)view->link_state;
    if (state > BLE_LINK_DISCONNECTING) state = BLE_LINK_INACTIVE;
    mui_canvas_draw_xbm(p_canvas, 0, 0, 13, 11, ble_status_bitmap[state]);

    bool valid = bat_has_reading();
    if (get_stats()) {
        mui_canvas_draw_xbm(p_canvas, 47, 1, 7, 9, charging_bolt);
    } else if (valid && bat_is_low()) {
        mui_canvas_set_font(p_canvas, MUI_FONT_SMALL);
        mui_canvas_draw_utf8_truncate(p_canvas, 16, 9, 39, getLangString(_L_DE3_BAT_LOW));
    }
    draw_voltage(p_canvas, valid);
    draw_battery(p_canvas, valid);
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
