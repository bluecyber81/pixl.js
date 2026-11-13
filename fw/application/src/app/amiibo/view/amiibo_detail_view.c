#include "amiibo_detail_view.h"
#include "amiibo_helper.h"
#include "amiibo_info_draw.h"
#include "db_header.h"
#include "i18n/language.h"
#include "mui_element.h"

#define ICON_LEFT 0xe1ac
#define ICON_RIGHT 0xe1aa
#define ICON_INFO 0xe0ae

static void amiibo_detail_view_draw_notes(amiibo_detail_view_t *view, mui_canvas_t *canvas) {
    const bool german = getLanguage() == LANGUAGE_DE_DE;
    const char *text = (const char *)view->ntag->notes;
    if (!*text) text = german ? "Keine eigene Notiz." : "No personal note.";
    mui_canvas_set_font(canvas, u8g2_font_wqy12_t_gb2312a);
    mui_canvas_set_draw_color(canvas, 1);
    mui_canvas_draw_box(canvas, 0, 0, mui_canvas_get_width(canvas), 12);
    mui_canvas_set_draw_color(canvas, 0);
    mui_canvas_draw_utf8(canvas, 2, 10, german ? "Eigene Notiz" : "Personal note");
    mui_canvas_set_draw_color(canvas, 1);
    view->note_total = mui_element_autowrap_text_box(canvas, 0, 12, mui_canvas_get_width(canvas),
                                                    29, 26, view->note_offset, 0, text);
    /* Preserve two full lines, including their descenders, above the controls. */
    mui_canvas_set_draw_color(canvas, 0);
    mui_canvas_draw_box(canvas, 0, 12, mui_canvas_get_width(canvas) - 4, 2);
    mui_canvas_set_draw_color(canvas, 1);
    mui_canvas_draw_utf8(canvas, 1, 52, german ? "L/R: blättern" : "L/R: scroll");
    mui_canvas_draw_utf8(canvas, 1, 63, german ? "Mitte: zurück" : "Center: back");
}

static void amiibo_detail_view_on_draw(mui_view_t *p_view, mui_canvas_t *p_canvas) {
    char buff[64];
    amiibo_detail_view_t *p_amiibo_detail_view = p_view->user_data;
    ntag_t *ntag = p_amiibo_detail_view->ntag;
    if (p_amiibo_detail_view->info_page == 3) {
        amiibo_detail_view_draw_notes(p_amiibo_detail_view, p_canvas);
        return;
    }
    if (p_amiibo_detail_view->info_page) {
        amiibo_info_draw(p_canvas, ntag, p_amiibo_detail_view->info_page);
        return;
    }

    mui_canvas_set_font(p_canvas, u8g2_font_wqy12_t_gb2312a);
    if (ntag->type == NTAG_215) {
        sprintf(buff, "%02d %02x:%02x:%02x:%02x:%02x:%02x:%02x", p_amiibo_detail_view->focus + 1, ntag->data[0],
            ntag->data[1], ntag->data[2], ntag->data[4], ntag->data[5], ntag->data[6], ntag->data[7]);
    } else {
        sprintf(buff, "%02d %02x:%02x:%02x:%02x:%02x:%02x:%02x", p_amiibo_detail_view->focus + 1, ntag->data[0],
            ntag->data[1], ntag->data[2], ntag->data[3], ntag->data[4], ntag->data[5], ntag->data[6]);
    }
    uint8_t y = 0;
    mui_canvas_draw_box(p_canvas, 0, y, mui_canvas_get_width(p_canvas), 12);
    mui_canvas_set_draw_color(p_canvas, 0);

    mui_canvas_set_font(p_canvas, u8g2_font_siji_t_6x10);
    if (p_amiibo_detail_view->focus > 0) {
        mui_canvas_draw_glyph(p_canvas, 0, y + 10, ICON_LEFT);
    }
    mui_canvas_set_font(p_canvas, u8g2_font_wqy12_t_gb2312a);
    mui_canvas_draw_utf8(p_canvas, 10, y + 10, buff);

    mui_canvas_set_font(p_canvas, u8g2_font_siji_t_6x10);
    if (p_amiibo_detail_view->focus < p_amiibo_detail_view->max_ntags - 1) {
        mui_canvas_draw_glyph(p_canvas, mui_canvas_get_width(p_canvas) - 10, y + 10, ICON_RIGHT);
    }
    mui_canvas_set_draw_color(p_canvas, 1);
    mui_canvas_set_font(p_canvas, u8g2_font_wqy12_t_gb2312a);

    y += 12;
    mui_rect_t old_clip, text_clip;
    mui_canvas_get_clip_window(p_canvas, &old_clip);
    text_clip = old_clip;
    if (mui_canvas_get_height(p_canvas) >= 64) {
        uint8_t bottom = mui_canvas_get_height(p_canvas) - AMIIBO_ACTIVE_HINT_HEIGHT;
        if ((uint16_t)text_clip.y + text_clip.h > bottom)
            text_clip.h = bottom > text_clip.y ? bottom - text_clip.y : 0;
        mui_canvas_set_clip_window(p_canvas, &text_clip);
    }

    if (ntag->read_only) {
        mui_canvas_set_font(p_canvas, u8g2_font_siji_t_6x10);
        mui_canvas_draw_glyph(p_canvas, 0, y += 12, ICON_INFO);
        mui_canvas_set_font(p_canvas, u8g2_font_wqy12_t_gb2312a);
        mui_canvas_draw_utf8(p_canvas, 12, y, string_get_cstr(p_amiibo_detail_view->file_name));
    } else {
        mui_canvas_draw_utf8(p_canvas, 0, y += 12, string_get_cstr(p_amiibo_detail_view->file_name));
    }

    uint32_t head = to_little_endian_int32(&ntag->data[84]);
    uint32_t tail = to_little_endian_int32(&ntag->data[88]);

    const db_amiibo_t *amd = get_amiibo_by_id(head, tail);
    if (amd != NULL) {
        const char *name =
            isChineseLanguage() && strlen(amd->name_cn) > 0 ? amd->name_cn : amd->name_en;
        y += 15;
        mui_element_autowrap_text(p_canvas, 0, y, mui_canvas_get_width(p_canvas), 24, name);
        /* A wrapped figure name occupies the second row. Never draw a note
         * over that row; the underlying metadata remains unchanged. */
        if (strlen(ntag->notes) > 0 &&
            mui_element_text_height(p_canvas, mui_canvas_get_width(p_canvas), name) <= 13) {
            mui_element_autowrap_text(p_canvas, 0, y + 13, mui_canvas_get_width(p_canvas), 13, ntag->notes);
        }
    } else if (head > 0 && tail > 0) {
        mui_canvas_draw_utf8(p_canvas, 0, y += 15, "Amiibo");
        sprintf(buff, "[%08x:%08x]", head, tail);
        mui_canvas_draw_utf8(p_canvas, 0, y += 15, buff);
    } else {
        mui_canvas_draw_utf8(p_canvas, 0, y += 13, getLangString(_L_BLANK_TAG));
    }
    mui_canvas_set_clip_window(p_canvas, &old_clip);
    amiibo_active_menu_hint(p_canvas, mui_canvas_get_width(p_canvas));
}

static void amiibo_detail_view_on_input(mui_view_t *p_view, mui_input_event_t *event) {
    amiibo_detail_view_t *p_amiibo_detail_view = p_view->user_data;
    if (p_amiibo_detail_view->info_page == 3) {
        if (event->key == INPUT_KEY_CENTER &&
            (event->type == INPUT_TYPE_SHORT || event->type == INPUT_TYPE_LONG)) {
            p_amiibo_detail_view->info_page = 0;
            if (p_amiibo_detail_view->event_cb)
                p_amiibo_detail_view->event_cb(AMIIBO_DETAIL_VIEW_EVENT_MENU, p_amiibo_detail_view);
        } else if (event->type == INPUT_TYPE_SHORT || event->type == INPUT_TYPE_LONG ||
                   event->type == INPUT_TYPE_REPEAT) {
            uint16_t maximum = p_amiibo_detail_view->note_total > 26 ?
                ((p_amiibo_detail_view->note_total - 1) / 26) * 26 : 0;
            if (event->key == INPUT_KEY_LEFT) {
                p_amiibo_detail_view->note_offset = p_amiibo_detail_view->note_offset >= 13 ?
                    p_amiibo_detail_view->note_offset - 13 : 0;
            } else if (event->key == INPUT_KEY_RIGHT) {
                uint16_t next = p_amiibo_detail_view->note_offset + 13;
                p_amiibo_detail_view->note_offset = next < maximum ? next : maximum;
            }
        }
        return;
    }
    if (p_amiibo_detail_view->info_page) {
        if (amiibo_info_input(&p_amiibo_detail_view->info_page, event) && p_amiibo_detail_view->event_cb)
            p_amiibo_detail_view->event_cb(AMIIBO_DETAIL_VIEW_EVENT_MENU, p_amiibo_detail_view);
        return;
    }
    if (event->type == INPUT_TYPE_SHORT || event->type == INPUT_TYPE_REPEAT || event->type == INPUT_TYPE_LONG) {
        switch (event->key) {
        case INPUT_KEY_LEFT:
            if (!p_amiibo_detail_view->max_ntags) break;
            p_amiibo_detail_view->navigate_direction = -1;
            if (p_amiibo_detail_view->focus > 0) {
                p_amiibo_detail_view->focus--;
            } else {
                p_amiibo_detail_view->focus = p_amiibo_detail_view->max_ntags - 1;
            }

            if (p_amiibo_detail_view->event_cb) {
                p_amiibo_detail_view->event_cb(AMIIBO_DETAIL_VIEW_EVENT_UPDATE, p_amiibo_detail_view);
            }
            break;
        case INPUT_KEY_RIGHT:
            if (!p_amiibo_detail_view->max_ntags) break;
            p_amiibo_detail_view->navigate_direction = 1;
            if (p_amiibo_detail_view->focus < p_amiibo_detail_view->max_ntags - 1) {
                p_amiibo_detail_view->focus++;
            } else {
                p_amiibo_detail_view->focus = 0;
            }

            if (p_amiibo_detail_view->event_cb) {
                p_amiibo_detail_view->event_cb(AMIIBO_DETAIL_VIEW_EVENT_UPDATE, p_amiibo_detail_view);
            }
            break;
        case INPUT_KEY_CENTER:

            if (p_amiibo_detail_view->event_cb) {
                p_amiibo_detail_view->event_cb(AMIIBO_DETAIL_VIEW_EVENT_MENU, p_amiibo_detail_view);
            }
            break;
        }
    }
}

static void amiibo_detail_view_on_enter(mui_view_t *p_view) {}

static void amiibo_detail_view_on_exit(mui_view_t *p_view) {}

amiibo_detail_view_t *amiibo_detail_view_create() {
    amiibo_detail_view_t *p_amiibo_detail_view = mui_mem_malloc(sizeof(amiibo_detail_view_t));
    if (!p_amiibo_detail_view) return NULL;
    memset(p_amiibo_detail_view, 0, sizeof(amiibo_detail_view_t));

    mui_view_t *p_view = mui_view_create();
    if (!p_view) { mui_mem_free(p_amiibo_detail_view); return NULL; }
    p_view->user_data = p_amiibo_detail_view;
    p_view->draw_cb = amiibo_detail_view_on_draw;
    p_view->input_cb = amiibo_detail_view_on_input;
    p_view->enter_cb = amiibo_detail_view_on_enter;
    p_view->exit_cb = amiibo_detail_view_on_exit;

    p_amiibo_detail_view->p_view = p_view;

    string_init(p_amiibo_detail_view->file_name);

    return p_amiibo_detail_view;
}

void amiibo_detail_view_free(amiibo_detail_view_t *p_view) {
    if (!p_view) return;
    string_clear(p_view->file_name);
    mui_view_free(p_view->p_view);
    mui_mem_free(p_view);
}

mui_view_t *amiibo_detail_view_get_view(amiibo_detail_view_t *p_view) { return p_view->p_view; }

void amiibo_detail_view_set_user_data(amiibo_detail_view_t *p_view, void *user_data) { p_view->user_data = user_data; }
void amiibo_detail_view_set_ntag(amiibo_detail_view_t *p_view, ntag_t *ntag) { p_view->ntag = ntag; }
