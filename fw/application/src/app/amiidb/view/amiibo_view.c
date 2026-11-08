#include "amiibo_view.h"
#include "amiibo_helper.h"
#include "amiibo_info_draw.h"
#include "db_header.h"
#include "i18n/language.h"
#include "mui_element.h"
#include "mui_qrcode_helper.h"
#include "ntag_store.h"
#include "settings.h"
#include "amiibo_usage_de.h"

#define ICON_LEFT 0xe1ac
#define ICON_RIGHT 0xe1aa
#define ICON_INFO 0xe0ae
#define DESC_AUTO_SCROLL_MS_PER_PIXEL 150
#define DESC_AUTO_SCROLL_MIN_TIME 1200

static uint16_t amiibo_view_draw_qrcode(mui_canvas_t *canvas, uint8_t text_top, const char *url) {
    uint16_t width = mui_canvas_get_width(canvas);
    /* Version 3-L holds 53 byte-mode characters. Longer product URLs need
     * version 4 and a 41px box including all four quiet-zone modules.
     * On the 128x64 LCD this sits at (87,23), below the name baseline. */
    uint8_t box = strlen(url) > 53 ? 41 : 37;
    uint16_t top = text_top + (box == 37 ? 2 : 0);
    if (width < box + 2 || top + box > mui_canvas_get_height(canvas)) return width;
    uint16_t left = width - box;
    return draw_qrcode(canvas, left, top, box, url) ? left - 2 : width;
}

static uint16_t amiibo_view_desc_max_offset(amiibo_view_t *p_amiibo_view) {
    if (p_amiibo_view->desc_page_size == 0 || p_amiibo_view->desc_total <= p_amiibo_view->desc_page_size) {
        return 0;
    }

    uint16_t page_count =
        (p_amiibo_view->desc_total + p_amiibo_view->desc_page_size - 1) / p_amiibo_view->desc_page_size;
    return p_amiibo_view->desc_page_size * (page_count - 1);
}

static void amiibo_view_desc_anim_exec(void *p, int32_t value) {
    amiibo_view_t *p_amiibo_view = p;
    if (value < 0) {
        value = 0;
    } else if (value > p_amiibo_view->desc_anim_max_offset) {
        value = p_amiibo_view->desc_anim_max_offset;
    }
    p_amiibo_view->desc_offset = value;
}

static void amiibo_view_stop_desc_anim(amiibo_view_t *p_amiibo_view) {
    mui_anim_stop(&p_amiibo_view->desc_anim);
    p_amiibo_view->desc_anim_running = false;
}

static void amiibo_view_reset_desc_scroll(amiibo_view_t *p_amiibo_view) {
    amiibo_view_stop_desc_anim(p_amiibo_view);
    p_amiibo_view->desc_offset = 0;
    p_amiibo_view->desc_auto_scroll_disabled = false;
}

static void amiibo_view_update_desc_anim(amiibo_view_t *p_amiibo_view) {
    uint16_t max_offset = amiibo_view_desc_max_offset(p_amiibo_view);
    if (p_amiibo_view->desc_offset > max_offset) {
        p_amiibo_view->desc_offset = max_offset;
    }

    if (!settings_get_data()->anim_enabled || p_amiibo_view->desc_auto_scroll_disabled || max_offset == 0) {
        amiibo_view_stop_desc_anim(p_amiibo_view);
        p_amiibo_view->desc_anim_max_offset = max_offset;
        return;
    }

    if (p_amiibo_view->desc_anim_running && p_amiibo_view->desc_anim_max_offset == max_offset) {
        return;
    }

    p_amiibo_view->desc_anim_max_offset = max_offset;
    uint32_t anim_time = max_offset * DESC_AUTO_SCROLL_MS_PER_PIXEL;
    if (anim_time < DESC_AUTO_SCROLL_MIN_TIME) {
        anim_time = DESC_AUTO_SCROLL_MIN_TIME;
    }
    mui_anim_set_time(&p_amiibo_view->desc_anim, anim_time);
    mui_anim_set_values(&p_amiibo_view->desc_anim, p_amiibo_view->desc_offset, max_offset);
    mui_anim_start(&p_amiibo_view->desc_anim);
    p_amiibo_view->desc_anim_running = true;
}

/* Read-only pages entered from the detail menu. Reuse the existing page and
 * scroll state; looking at a note must never select another slot or alter NFC. */
static const char *amiibo_view_usage(const amiibo_view_t *view, char *translated) {
    const ntag_t *tag = view->ntag;
    const db_link_t *link = get_link_by_id(view->game_id, to_little_endian_int32(&tag->data[84]),
                                         to_little_endian_int32(&tag->data[88]));
    if (!link) return "";
    const db_notes_t *notes = &db_usage_notes[link->note_index];
    if (isChineseLanguage()) return notes->cn;
    return getLanguage() == LANGUAGE_DE_DE ? amiibo_usage_de(notes->en, translated, AMIIBO_USAGE_DE_BUFFER_BYTES) : notes->en;
}

static void amiibo_view_draw_notes(amiibo_view_t *view, mui_canvas_t *canvas, char *translated) {
    const bool german = getLanguage() == LANGUAGE_DE_DE;
    const bool own = view->info_page == 3;
    const char *text = own ? (const char *)view->ntag->notes : amiibo_view_usage(view, translated);
    if (!*text) text = own ? (german ? "Keine eigene Notiz." : "No personal note.") :
        (german ? "Kein Hinweis zur Spielauswahl. Spiel in der Datenbank wählen." :
                  "No hint for this game selection. Choose a game in the database.");
    mui_canvas_set_font(canvas, u8g2_font_wqy12_t_gb2312a);
    mui_canvas_set_draw_color(canvas, 1);
    mui_canvas_draw_box(canvas, 0, 0, mui_canvas_get_width(canvas), 12);
    mui_canvas_set_draw_color(canvas, 0);
    mui_canvas_draw_utf8(canvas, 2, 10, own ? (german ? "Deine Notiz" : "Your note") :
                                                  (german ? "Spielhinweis" : "Game hint"));
    mui_canvas_draw_utf8(canvas, 105, 10, own ? "1/2" : "2/2");
    mui_canvas_set_draw_color(canvas, 1);
    /* Whole-line scrolling also makes the final page readable at its limit. */
    view->desc_step = mui_canvas_current_font_height(canvas);
    view->desc_page_size = view->desc_step * 2;
    /* This fixed 13px font needs its two descent pixels below each baseline.
     * The 29px viewport preserves the second line above the footer (y=41).
     * Clear only the previous line's descent at the top, not the scrollbar. */
    view->desc_total = mui_element_autowrap_text_box(canvas, 0, 12, mui_canvas_get_width(canvas),
                                                    29, view->desc_page_size, view->desc_offset, 0, text);
    mui_canvas_set_draw_color(canvas, 0);
    mui_canvas_draw_box(canvas, 0, 12, mui_canvas_get_width(canvas) - 4, 2);
    mui_canvas_set_draw_color(canvas, 1);
    mui_canvas_draw_utf8(canvas, 1, 52, german ? "L/R: Seite  M: zurück" : "L/R: page  M: back");
    mui_canvas_draw_utf8(canvas, 1, 63, german ? "L/R halten: blättern" : "Hold L/R: scroll");
}

static void amiibo_view_on_draw(mui_view_t *p_view, mui_canvas_t *p_canvas) {
    /* The UID or QR text is consumed before drawing the translated note. */
    union { char label[AMIIBO_INFO_URL_CAPACITY]; char de[AMIIBO_USAGE_DE_BUFFER_BYTES]; } scratch;
    char *buff = scratch.label;
    amiibo_view_t *p_amiibo_view = p_view->user_data;
    ntag_t *ntag = p_amiibo_view->ntag;
    if (p_amiibo_view->info_page >= 3) {
        amiibo_view_draw_notes(p_amiibo_view, p_canvas, scratch.de);
        return;
    }
    if (p_amiibo_view->info_page) {
        amiibo_info_draw(p_canvas, ntag, p_amiibo_view->info_page);
        return;
    }

    mui_canvas_set_font(p_canvas, u8g2_font_wqy12_t_gb2312a);
    uint8_t uid[7];
    ntag_store_get_uuid(ntag, uid);
    sprintf(buff, "%02d %02x:%02x:%02x:%02x:%02x:%02x:%02x", p_amiibo_view->focus + 1, uid[0], uid[1],
            uid[2], uid[3], uid[4], uid[5], uid[6]);

    uint8_t y = 0;
    mui_canvas_draw_box(p_canvas, 0, y, mui_canvas_get_width(p_canvas), 12);
    mui_canvas_set_draw_color(p_canvas, 0);

    mui_canvas_set_font(p_canvas, u8g2_font_siji_t_6x10);
    if (p_amiibo_view->focus > 0) {
        mui_canvas_draw_glyph(p_canvas, 0, y + 10, ICON_LEFT);
    }
    mui_canvas_set_font(p_canvas, u8g2_font_wqy12_t_gb2312a);
    mui_canvas_draw_utf8(p_canvas, 10, y + 10, buff);

    mui_canvas_set_font(p_canvas, u8g2_font_siji_t_6x10);
    if (p_amiibo_view->focus < p_amiibo_view->max_ntags - 1) {
        mui_canvas_draw_glyph(p_canvas, mui_canvas_get_width(p_canvas) - 10, y + 10, ICON_RIGHT);
    }
    mui_canvas_set_draw_color(p_canvas, 1);
    mui_canvas_set_font(p_canvas, u8g2_font_wqy12_t_gb2312a);

    y += 11;

    uint32_t head = to_little_endian_int32(&ntag->data[84]);
    uint32_t tail = to_little_endian_int32(&ntag->data[88]);

    const db_amiibo_t *amd = get_amiibo_by_id(head, tail);
    if (amd != NULL) {
        const char *name =
            isChineseLanguage() && strlen(amd->name_cn) > 0 ? amd->name_cn : amd->name_en;

        if (ntag->read_only) {
            mui_canvas_set_font(p_canvas, u8g2_font_siji_t_6x10);
            mui_canvas_draw_glyph(p_canvas, 0, y += 12, ICON_INFO);
            mui_canvas_set_font(p_canvas, u8g2_font_wqy12_t_gb2312a);
            mui_canvas_draw_utf8(p_canvas, 12, y, name);
        } else {
            mui_canvas_draw_utf8(p_canvas, 0, y += 12, name);
        }
        mui_rect_t clip_win_prev;
        mui_rect_t clip_win_cur;
        mui_canvas_get_clip_window(p_canvas, &clip_win_prev);
        clip_win_cur.x = 0;
        clip_win_cur.y = y;
        clip_win_cur.w = mui_canvas_get_width(p_canvas);
        clip_win_cur.h = mui_canvas_get_height(p_canvas) - y;
        mui_canvas_set_clip_window(p_canvas, &clip_win_cur);

        /* Keep the complete QR stationary while the description scrolls.
         * Its own quiet zone and a separate text clip prevent moving text or
         * the scrollbar from painting over the scan target. */
        uint16_t text_width = clip_win_cur.w;
        if (settings_get_data()->qrcode_enabled) {
            if (amiibo_info_url(buff, sizeof(scratch.label), ntag))
                text_width = amiibo_view_draw_qrcode(p_canvas, y, buff);
        }
        p_amiibo_view->desc_step = 8;
        p_amiibo_view->desc_page_size = clip_win_cur.h;
        p_amiibo_view->desc_total = 0;
        if (strlen(ntag->notes) > 0) {
            p_amiibo_view->desc_total =
                mui_element_autowrap_text_box(p_canvas, clip_win_cur.x, clip_win_cur.y, text_width, clip_win_cur.h,
                                              p_amiibo_view->desc_page_size, p_amiibo_view->desc_offset, 0, ntag->notes);
        } else {
            const char *notes = amiibo_view_usage(p_amiibo_view, scratch.de);
            p_amiibo_view->desc_total =
                mui_element_autowrap_text_box(p_canvas, clip_win_cur.x, clip_win_cur.y, text_width, clip_win_cur.h,
                                              p_amiibo_view->desc_page_size, p_amiibo_view->desc_offset, 0, notes);
        }
        mui_canvas_set_clip_window(p_canvas, &clip_win_prev);
        amiibo_view_update_desc_anim(p_amiibo_view);
    } else if (head > 0 && tail > 0) {
        amiibo_view_stop_desc_anim(p_amiibo_view);
        p_amiibo_view->desc_total = 0;
        p_amiibo_view->desc_page_size = 0;
        mui_canvas_draw_utf8(p_canvas, 0, y += 15, "Amiibo");
        sprintf(buff, "[%08x:%08x]", head, tail);
        mui_canvas_draw_utf8(p_canvas, 0, y += 15, buff);
        if (settings_get_data()->qrcode_enabled) {
            if (amiibo_info_url(buff, sizeof(scratch.label), ntag)) amiibo_view_draw_qrcode(p_canvas, 24, buff);
        }
    } else {
        amiibo_view_stop_desc_anim(p_amiibo_view);
        p_amiibo_view->desc_total = 0;
        p_amiibo_view->desc_page_size = 0;
        mui_canvas_draw_utf8(p_canvas, 0, y += 13, getLangString(_L_BLANK_TAG));
    }
}

static void amiibo_view_on_input(mui_view_t *p_view, mui_input_event_t *event) {
    amiibo_view_t *p_amiibo_view = p_view->user_data;
    if (p_amiibo_view->info_page >= 3) {
        if (event->key == INPUT_KEY_CENTER &&
            (event->type == INPUT_TYPE_SHORT || event->type == INPUT_TYPE_LONG)) {
            p_amiibo_view->info_page = 0;
            if (p_amiibo_view->event_cb) p_amiibo_view->event_cb(AMIIBO_VIEW_EVENT_MENU, p_amiibo_view);
            return;
        }
        if (event->type == INPUT_TYPE_SHORT &&
            (event->key == INPUT_KEY_LEFT || event->key == INPUT_KEY_RIGHT)) {
            p_amiibo_view->info_page = p_amiibo_view->info_page == 3 ? 4 : 3;
            amiibo_view_reset_desc_scroll(p_amiibo_view);
            p_amiibo_view->desc_auto_scroll_disabled = true;
            return;
        }
        /* Long/repeat left or right reuses text scrolling below, never slots. */
    } else if (p_amiibo_view->info_page) {
        if (amiibo_info_input(&p_amiibo_view->info_page, event) && p_amiibo_view->event_cb)
            p_amiibo_view->event_cb(AMIIBO_VIEW_EVENT_MENU, p_amiibo_view);
        return;
    }
    if (event->type == INPUT_TYPE_REPEAT || event->type == INPUT_TYPE_LONG) {
        switch (event->key) {
        case INPUT_KEY_LEFT:
            amiibo_view_stop_desc_anim(p_amiibo_view);
            p_amiibo_view->desc_auto_scroll_disabled = true;
            if (p_amiibo_view->desc_offset >= p_amiibo_view->desc_step) {
                p_amiibo_view->desc_offset -= p_amiibo_view->desc_step;
            } else {
                p_amiibo_view->desc_offset = 0;
            }

            if (p_amiibo_view->event_cb) {
                p_amiibo_view->event_cb(AMIIBO_VIEW_EVENT_DESC_UPDATE, p_amiibo_view);
            }
            break;
        case INPUT_KEY_RIGHT: {
            amiibo_view_stop_desc_anim(p_amiibo_view);
            p_amiibo_view->desc_auto_scroll_disabled = true;
            uint16_t max_offset = amiibo_view_desc_max_offset(p_amiibo_view);
            if (p_amiibo_view->desc_offset < max_offset) {
                p_amiibo_view->desc_offset += p_amiibo_view->desc_step;
                if (p_amiibo_view->desc_offset > max_offset) {
                    p_amiibo_view->desc_offset = max_offset;
                }
            }

            if (p_amiibo_view->event_cb) {
                p_amiibo_view->event_cb(AMIIBO_VIEW_EVENT_DESC_UPDATE, p_amiibo_view);
            }
        } break;
        }
    } else if (event->type == INPUT_TYPE_SHORT) {
        switch (event->key) {
        case INPUT_KEY_LEFT:
            amiibo_view_reset_desc_scroll(p_amiibo_view);
            if (p_amiibo_view->max_ntags > 1) {
                if (p_amiibo_view->focus > 0) {
                    p_amiibo_view->focus--;
                } else {
                    p_amiibo_view->focus = p_amiibo_view->max_ntags - 1;
                }

                if (p_amiibo_view->event_cb) {
                    p_amiibo_view->event_cb(AMIIBO_VIEW_EVENT_UPDATE, p_amiibo_view);
                }
            }
            break;
        case INPUT_KEY_RIGHT:
            amiibo_view_reset_desc_scroll(p_amiibo_view);
            if (p_amiibo_view->max_ntags > 1) {
                if (p_amiibo_view->focus < p_amiibo_view->max_ntags - 1) {
                    p_amiibo_view->focus++;
                } else {
                    p_amiibo_view->focus = 0;
                }

                if (p_amiibo_view->event_cb) {
                    p_amiibo_view->event_cb(AMIIBO_VIEW_EVENT_UPDATE, p_amiibo_view);
                }
            }
            break;
        case INPUT_KEY_CENTER:

            if (p_amiibo_view->event_cb) {
                p_amiibo_view->event_cb(AMIIBO_VIEW_EVENT_MENU, p_amiibo_view);
            }
            break;
        }
    }
}

static void amiibo_view_on_enter(mui_view_t *p_view) {
    amiibo_view_t *p_amiibo_view = p_view->user_data;
    amiibo_view_reset_desc_scroll(p_amiibo_view);
    if (p_amiibo_view->info_page >= 3) p_amiibo_view->desc_auto_scroll_disabled = true;
}

static void amiibo_view_on_exit(mui_view_t *p_view) {
    amiibo_view_t *p_amiibo_view = p_view->user_data;
    amiibo_view_stop_desc_anim(p_amiibo_view);
}

amiibo_view_t *amiibo_view_create() {
    amiibo_view_t *p_amiibo_view = mui_mem_malloc(sizeof(amiibo_view_t));
    if (!p_amiibo_view) return NULL;
    memset(p_amiibo_view, 0, sizeof(amiibo_view_t));

    mui_view_t *p_view = mui_view_create();
    if (!p_view) { mui_mem_free(p_amiibo_view); return NULL; }
    p_view->user_data = p_amiibo_view;
    p_view->draw_cb = amiibo_view_on_draw;
    p_view->input_cb = amiibo_view_on_input;
    p_view->enter_cb = amiibo_view_on_enter;
    p_view->exit_cb = amiibo_view_on_exit;
    p_amiibo_view->p_view = p_view;
    mui_anim_init(&p_amiibo_view->desc_anim);
    mui_anim_set_var(&p_amiibo_view->desc_anim, p_amiibo_view);
    mui_anim_set_path_cb(&p_amiibo_view->desc_anim, lv_anim_path_linear);
    mui_anim_set_exec_cb(&p_amiibo_view->desc_anim, amiibo_view_desc_anim_exec);
    mui_anim_set_auto_restart(&p_amiibo_view->desc_anim, true);
    return p_amiibo_view;
}

void amiibo_view_free(amiibo_view_t *p_view) {
    if (!p_view) return;
    amiibo_view_stop_desc_anim(p_view);
    mui_view_free(p_view->p_view);
    mui_mem_free(p_view);
}

mui_view_t *amiibo_view_get_view(amiibo_view_t *p_view) { return p_view->p_view; }
