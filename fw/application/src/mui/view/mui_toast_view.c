//
// Created by solos on 9/9/2023.
//

#include "mui_toast_view.h"
#include "app_timer.h"

#define MUI_TOAST_DISPLAY_TIME 2000

APP_TIMER_DEF(m_toast_timer_id);
bool m_toast_timer_initialized = false;

static void mui_toast_timer_handler(void *p_context) {
    mui_toast_view_t *p_toast_view = (mui_toast_view_t *)p_context;
    p_toast_view->is_visible = false;
    mui_update(mui());
}

static void mui_toast_view_on_draw(mui_view_t *p_view, mui_canvas_t *p_canvas) {
    mui_toast_view_t *p_toast_view = (mui_toast_view_t *)p_view->user_data;
    const char *msg = string_get_cstr(p_toast_view->message);
    mui_canvas_set_font(p_canvas, u8g2_font_wqy12_t_gb2312a);
    if (p_toast_view->is_visible && string_size(p_toast_view->message) > 0) {
        const uint8_t padding = 3;
        uint8_t cw = mui_canvas_get_width(p_canvas), ch = mui_canvas_get_height(p_canvas);
        uint8_t ft = mui_canvas_current_font_height(p_canvas);
        if (cw <= 2 * padding || ch <= 2 * padding || !ft) return;
        uint8_t mw = cw > 16 ? cw - 16 : cw - 2 * padding;
        mui_text_size_t text_size = mui_element_text_size(p_canvas, mw, msg);
        uint8_t tw = LV_MIN(mw, text_size.width ? text_size.width : 1);
        /* Remeasure at the actual inner width, then use that exact width to
         * draw. Newlines and glyph spacing therefore affect both equally. */
        text_size = mui_element_text_size(p_canvas, tw, msg);
        uint8_t max_text_height = ((ch - 2 * padding) / ft) * ft;
        if (!max_text_height) return;
        uint8_t th = LV_MIN(max_text_height, text_size.height);
        uint8_t w = tw + 2 * padding, h = th + 2 * padding;
        uint8_t x = (cw - w) / 2, y = (ch - h) / 2;

        mui_canvas_set_draw_color(p_canvas, 0);
        mui_canvas_draw_box(p_canvas, x, y, w, h);
        mui_canvas_set_draw_color(p_canvas, 1);
        mui_canvas_draw_rframe(p_canvas, x, y, w, h, 3);

        mui_rect_t previous, inner;
        mui_canvas_get_clip_window(p_canvas, &previous);
        /* Preserve the caller's clip, including a reserved status area. */
        uint16_t left = LV_MAX(previous.x, x + padding);
        uint16_t top = LV_MAX(previous.y, y + padding);
        uint16_t right = LV_MIN(previous.x + previous.w, x + padding + tw);
        uint16_t bottom = LV_MIN(previous.y + previous.h, y + padding + th);
        if (right > left && bottom > top) {
            inner.x = left; inner.y = top;
            inner.w = right - left; inner.h = bottom - top;
            mui_canvas_set_clip_window(p_canvas, &inner);
            mui_element_autowrap_text(p_canvas, x + padding,
                                      y + padding + mui_canvas_current_font_ascent(p_canvas), tw, th, msg);
            mui_canvas_set_clip_window(p_canvas, &previous);
        }
    }
}

static void mui_toast_view_on_input(mui_view_t *p_view, mui_input_event_t *event) {}

static void mui_toast_view_on_enter(mui_view_t *p_view) {}

static void mui_toast_view_on_exit(mui_view_t *p_view) {}

mui_toast_view_t *mui_toast_view_create() {
    mui_toast_view_t *p_toast_view = (mui_toast_view_t *)mui_mem_malloc(sizeof(mui_toast_view_t));
    if (!p_toast_view) return NULL;
    memset(p_toast_view, 0, sizeof(mui_toast_view_t));
    mui_view_t *p_view = mui_view_create();
    if (!p_view) {
        mui_mem_free(p_toast_view);
        return NULL;
    }
    p_view->user_data = p_toast_view;
    p_view->draw_cb = mui_toast_view_on_draw;
    p_view->input_cb = mui_toast_view_on_input;
    p_view->enter_cb = mui_toast_view_on_enter;
    p_view->exit_cb = mui_toast_view_on_exit;

    p_toast_view->p_view = p_view;

    string_init(p_toast_view->message);

    if (!m_toast_timer_initialized) {
        ret_code_t err_code = app_timer_create(&m_toast_timer_id, APP_TIMER_MODE_SINGLE_SHOT, mui_toast_timer_handler);
        if (err_code != NRF_SUCCESS) {
            string_clear(p_toast_view->message);
            mui_view_free(p_view);
            mui_mem_free(p_toast_view);
            return NULL;
        }
        m_toast_timer_initialized = true;
    }

    return p_toast_view;
}
void mui_toast_view_free(mui_toast_view_t *p_view) {
    if (!p_view) return;
    app_timer_stop(m_toast_timer_id);
    string_clear(p_view->message);
    mui_mem_free(p_view->p_view);
    mui_mem_free(p_view);
}

mui_view_t *mui_toast_view_get_view(mui_toast_view_t *p_view) { return p_view->p_view; }

void mui_toast_view_show(mui_toast_view_t *p_view, const char *message) {
    string_set_str(p_view->message, message);
    p_view->is_visible = true;
    ret_code_t err_code = app_timer_stop(m_toast_timer_id);
    APP_ERROR_CHECK(err_code);
    err_code = app_timer_start(m_toast_timer_id, APP_TIMER_TICKS(MUI_TOAST_DISPLAY_TIME), p_view);
    APP_ERROR_CHECK(err_code);
}
