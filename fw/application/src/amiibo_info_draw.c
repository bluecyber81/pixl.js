#include "amiibo_info_draw.h"
#include "amiibo_helper.h"
#include "db_header.h"
#include "i18n/language.h"
#include "mui_qrcode_helper.h"
#include <stdio.h>

bool amiibo_info_url(char *out, size_t capacity, const ntag_t *tag) {
    if (!out || !capacity) return false;
    out[0] = 0;
    if (!tag) return false;
    uint32_t head = to_little_endian_int32(&tag->data[84]);
    uint32_t tail = to_little_endian_int32(&tag->data[88]);
    if (!head && !tail) return false;
    /* These products have public pages, but the site's ID resolver returned
     * 404 on 2026-11-01. Never change tag IDs to accommodate a website. */
    const char *product_url = NULL;
    if (head == 0x00000004 && tail == 0x04431c02)
        product_url = "https://amiibo.life/amiibo/my-mario-wood-blocks/mario-melody-car";
    else if (head == 0x000a0004 && tail == 0x04451c02)
        product_url = "https://amiibo.life/amiibo/my-mario-wood-blocks/toad";
    /* Public model identity only. Never include UID, filename, owner or save. */
    int length = product_url ? snprintf(out, capacity, "%s", product_url) :
        snprintf(out, capacity, "https://amiibo.life/nfc/%08lx-%08lx",
                 (unsigned long)head, (unsigned long)tail);
    if (length < 0 || (size_t)length >= capacity) { out[0] = 0; return false; }
    return true;
}

bool amiibo_info_input(uint8_t *page, const mui_input_event_t *event) {
    if (!page || !*page || !event) return false;
    if (event->key == INPUT_KEY_CENTER &&
        (event->type == INPUT_TYPE_SHORT || event->type == INPUT_TYPE_LONG)) {
        *page = 0;
        return true;
    }
    if (event->type == INPUT_TYPE_SHORT &&
        (event->key == INPUT_KEY_LEFT || event->key == INPUT_KEY_RIGHT)) {
        *page = *page == 1 ? 2 : 1;
    }
    return false;
}

void amiibo_info_draw(mui_canvas_t *canvas, const ntag_t *tag, uint8_t page) {
    if (!canvas || !tag || mui_canvas_get_width(canvas) < 128 || mui_canvas_get_height(canvas) < 64) return;
    uint8_t old_color = mui_canvas_get_draw_color(canvas);
    mui_canvas_set_font(canvas, u8g2_font_wqy12_t_gb2312a);
    mui_canvas_set_draw_color(canvas, 1);
    mui_canvas_draw_box(canvas, 0, 0, 128, 12);
    mui_canvas_set_draw_color(canvas, 0);
    mui_canvas_draw_utf8(canvas, 2, 10, _T(DE3_FIGURE_INFO));
    mui_canvas_draw_utf8(canvas, 105, 10, page == 2 ? "2/2" : "1/2");
    mui_canvas_set_draw_color(canvas, 1);
    char text[AMIIBO_INFO_URL_CAPACITY];
    if (page == 2) {
        if (amiibo_info_url(text, sizeof(text), tag)) {
            draw_qrcode(canvas, 0, 14, 50, text);
            mui_canvas_draw_utf8(canvas, 54, 26, _T(DE3_PUBLIC_ID_ONLY));
            mui_canvas_draw_utf8(canvas, 54, 38, "Web-Info");
            mui_canvas_draw_utf8(canvas, 54, 50, _T(DE3_INFO_PRESS));
            mui_canvas_draw_utf8(canvas, 54, 62, _T(BACK));
        } else {
            mui_canvas_draw_utf8(canvas, 2, 30, _T(BLANK_TAG));
        }
    } else {
        uint32_t head = to_little_endian_int32(&tag->data[84]);
        uint32_t tail = to_little_endian_int32(&tag->data[88]);
        mui_canvas_draw_utf8(canvas, 2, 24, get_amiibo_by_id(head, tail) ?
                            _T(DE3_CATALOG_KNOWN) : _T(DE3_CATALOG_UNKNOWN));
        snprintf(text, sizeof(text), "ID: %08lX", (unsigned long)head);
        mui_canvas_draw_utf8(canvas, 2, 37, text);
        snprintf(text, sizeof(text), "    %08lX", (unsigned long)tail);
        mui_canvas_draw_utf8(canvas, 2, 49, text);
        mui_canvas_draw_utf8(canvas, 2, 62, tag->type == NTAG_I2C_PLUS_2K ? "I2C 2K" : "NTAG215");
        mui_canvas_draw_utf8(canvas, 92, 62, "QR >");
    }
    mui_canvas_set_draw_color(canvas, old_color);
}
