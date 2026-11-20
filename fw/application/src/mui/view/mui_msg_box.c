#include "mui_msg_box.h"
#include "i18n/language.h"
#include "mui_core.h"

static uint8_t mui_msg_box_get_button_num(mui_msg_box_t *p_mui_msg_box) {
    return (string_size(p_mui_msg_box->btn_left_text) > 0) + (string_size(p_mui_msg_box->btn_center_text) > 0) +
           (string_size(p_mui_msg_box->btn_right_text) > 0);
}

static void mui_msg_box_on_draw(mui_view_t *p_view, mui_canvas_t *p_canvas) {
    mui_canvas_set_font(p_canvas, u8g2_font_wqy12_t_gb2312a);
    mui_msg_box_t *p_mui_msg_box = p_view->user_data;

    uint8_t font_height = mui_canvas_current_font_height(p_canvas);
    uint8_t canvas_width = mui_canvas_get_width(p_canvas);
    uint8_t canvas_height = mui_canvas_get_height(p_canvas);

    uint16_t left_width = string_size(p_mui_msg_box->btn_left_text)
        ? mui_canvas_get_utf8_width(p_canvas, string_get_cstr(p_mui_msg_box->btn_left_text)) + 4u : 0;
    uint16_t center_width = string_size(p_mui_msg_box->btn_center_text)
        ? mui_canvas_get_utf8_width(p_canvas, string_get_cstr(p_mui_msg_box->btn_center_text)) + 4u : 0;
    uint16_t right_width = string_size(p_mui_msg_box->btn_right_text)
        ? mui_canvas_get_utf8_width(p_canvas, string_get_cstr(p_mui_msg_box->btn_right_text)) + 4u : 0;
    uint8_t center_x = center_width < canvas_width ? (canvas_width - center_width) / 2 : 0;
    uint8_t right_x = right_width < canvas_width ? canvas_width - right_width : 0;
    uint8_t button_y = canvas_height > font_height + 4 ? canvas_height - font_height - 4 : 0;
    uint8_t center_y = button_y;
    /* Keep full action labels readable on the 128px LCD. When three buttons
     * collide, the middle action gets its own row; focus/key order is unchanged. */
    if (left_width && center_width && right_width &&
        (left_width + 2 > center_x || center_x + center_width + 2 > right_x) &&
        button_y >= font_height + 3) {
        center_y -= font_height + 3;
    }
    uint8_t text_end = (left_width || center_width || right_width) ? center_y : canvas_height;
    uint8_t text_height = text_end > font_height * 2 ? text_end - font_height * 2 : 0;

    mui_canvas_set_draw_color(p_canvas, 1);
    mui_canvas_draw_box(p_canvas, 0, 0, canvas_width, font_height + 1);
    mui_canvas_set_draw_color(p_canvas, 0);
    mui_canvas_draw_utf8(p_canvas, 2, font_height - 2, string_get_cstr(p_mui_msg_box->header));
    mui_canvas_set_draw_color(p_canvas, 1);

    mui_element_autowrap_text(p_canvas, 0, font_height * 2, canvas_width, text_height,
                              string_get_cstr(p_mui_msg_box->message));

    // Draw buttons
    if (string_size(p_mui_msg_box->btn_left_text) > 0) {
        mui_element_button(p_canvas, 0, button_y, string_get_cstr(p_mui_msg_box->btn_left_text),
                           p_mui_msg_box->focus == 0);
    }

    if (string_size(p_mui_msg_box->btn_center_text) > 0) {
        const char *text = string_get_cstr(p_mui_msg_box->btn_center_text);
        mui_element_button(p_canvas, center_x, center_y, text, p_mui_msg_box->focus == 1);
    }

    if (string_size(p_mui_msg_box->btn_right_text) > 0) {
        const char *text = string_get_cstr(p_mui_msg_box->btn_right_text);
        mui_element_button(p_canvas, right_x, button_y, text, p_mui_msg_box->focus == 2);
    }
    if (p_mui_msg_box->awaiting_frame) {
        p_mui_msg_box->awaiting_frame = false;
        mui_fence_input_after_frame();
    }
}

static void mui_msg_box_on_input(mui_view_t *p_view, mui_input_event_t *event) {
    mui_msg_box_t *p_mui_msg_box = p_view->user_data;
    /* A callback may replace this dialog without changing the active view. */
    if (p_mui_msg_box->awaiting_frame) return;
    if (event->type == INPUT_TYPE_SHORT) {
        switch (event->key) {
        case INPUT_KEY_LEFT:
            if (mui_msg_box_get_button_num(p_mui_msg_box) > 1) {
                uint8_t state[3] = {string_size(p_mui_msg_box->btn_left_text) > 0,
                                    string_size(p_mui_msg_box->btn_center_text) > 0,
                                    string_size(p_mui_msg_box->btn_right_text) > 0};
                uint8_t focus = p_mui_msg_box->focus;
                do {
                    focus--;
                    if (focus == 0xFF) {
                        focus = 2;
                    }

                } while (!state[focus]);
                p_mui_msg_box->focus = focus;
            }
            break;
        case INPUT_KEY_RIGHT:
            if (mui_msg_box_get_button_num(p_mui_msg_box) > 1) {
                uint8_t state[3] = {string_size(p_mui_msg_box->btn_left_text) > 0,
                                    string_size(p_mui_msg_box->btn_center_text) > 0,
                                    string_size(p_mui_msg_box->btn_right_text) > 0};
                uint8_t focus = p_mui_msg_box->focus;
                do {
                    focus++;
                    if (focus == 3) {
                        focus = 0;
                    }

                } while (!state[focus]);
                p_mui_msg_box->focus = focus;
            }

            break;

        case INPUT_KEY_CENTER:
            if (p_mui_msg_box->event_cb) {
                p_mui_msg_box->event_cb(p_mui_msg_box->focus, p_mui_msg_box);
            }
            break;
        }
    }
}

static void mui_msg_box_on_enter(mui_view_t *p_view) {
    ((mui_msg_box_t *)p_view->user_data)->awaiting_frame = true;
}

static void mui_msg_box_on_exit(mui_view_t *p_view) {}

mui_msg_box_t *mui_msg_box_create() {
    mui_msg_box_t *p_mui_msg_box = mui_mem_malloc(sizeof(mui_msg_box_t));
    if (!p_mui_msg_box) return NULL;
    memset(p_mui_msg_box, 0, sizeof(*p_mui_msg_box));

    mui_view_t *p_view = mui_view_create();
    if (!p_view) {
        mui_mem_free(p_mui_msg_box);
        return NULL;
    }
    p_view->user_data = p_mui_msg_box;
    p_view->draw_cb = mui_msg_box_on_draw;
    p_view->input_cb = mui_msg_box_on_input;
    p_view->enter_cb = mui_msg_box_on_enter;
    p_view->exit_cb = mui_msg_box_on_exit;

    p_mui_msg_box->p_view = p_view;
    string_init(p_mui_msg_box->header);
    string_init(p_mui_msg_box->message);
    string_init(p_mui_msg_box->btn_center_text);
    string_init(p_mui_msg_box->btn_left_text);
    string_init(p_mui_msg_box->btn_right_text);
    p_mui_msg_box->event_cb = NULL;
    p_mui_msg_box->focus = 0;

    return p_mui_msg_box;
}

void mui_msg_box_free(mui_msg_box_t *p_view) {
    if (!p_view) return;
    string_clear(p_view->header);
    string_clear(p_view->message);
    string_clear(p_view->btn_center_text);
    string_clear(p_view->btn_left_text);
    string_clear(p_view->btn_right_text);
    mui_mem_free(p_view->p_view);
    mui_mem_free(p_view);
}

mui_view_t *mui_msg_box_get_view(mui_msg_box_t *p_view) { return p_view->p_view; }

void mui_msg_box_set_user_data(mui_msg_box_t *p_view, void *user_data) { p_view->user_data = user_data; }

void *mui_msg_box_get_user_data(mui_msg_box_t *p_view) { return p_view->user_data; }

//// view functions //
void mui_msg_box_set_event_cb(mui_msg_box_t *p_view, mui_msg_box_event_cb_t event_cb) {
    p_view->event_cb = event_cb;
    p_view->awaiting_frame = true;
}
void mui_msg_box_set_header(mui_msg_box_t *p_view, const char *header) {
    string_set_str(p_view->header, header);
}
void mui_msg_box_set_message(mui_msg_box_t *p_view, const char *message) {
    /* Progress captions keep the current actions and any held Cancel gesture.
     * A new decision is armed by its buttons/callback or by entering the view. */
    string_set_str(p_view->message, message);
}
void mui_msg_box_set_btn_focus(mui_msg_box_t *p_view, uint8_t focus) {
    p_view->focus = focus;
    p_view->awaiting_frame = true;
}
void mui_msg_box_set_btn_text(mui_msg_box_t *p_view, const char *left, const char *center, const char *right) {
    p_view->awaiting_frame = true;
    if (left != NULL) {
        string_set_str(p_view->btn_left_text, left);
    } else {
        string_reset(p_view->btn_left_text);
    }

    if (center != NULL) {
        string_set_str(p_view->btn_center_text, center);
    } else {
        string_reset(p_view->btn_center_text);
    }
    if (right != NULL) {
        string_set_str(p_view->btn_right_text, right);
    } else {
        string_reset(p_view->btn_right_text);
    }
}
void mui_msg_box_set_error(mui_msg_box_t *box, const char *message, mui_msg_box_event_cb_t close) {
    mui_msg_box_set_header(box, _T(ERR));
    mui_msg_box_set_message(box, message);
    mui_msg_box_set_btn_text(box, NULL, _T(BACK), NULL);
    mui_msg_box_set_btn_focus(box, MUI_MSG_BOX_EVENT_SELECT_CENTER);
    mui_msg_box_set_event_cb(box, close);
}

void mui_msg_box_reset(mui_msg_box_t *p_view) {
    p_view->awaiting_frame = true;
    string_reset(p_view->header);
    string_reset(p_view->message);
    string_reset(p_view->btn_center_text);
    string_reset(p_view->btn_left_text);
    string_reset(p_view->btn_right_text);
}
