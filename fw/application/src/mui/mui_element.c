#include "mui_element.h"
#include "nrf_log.h"

void mui_element_scrollbar(mui_canvas_t *p_canvas, uint32_t pos, uint16_t total) {
    uint8_t width = mui_canvas_get_width(p_canvas);
    uint8_t height = mui_canvas_get_height(p_canvas);
    if (width < 4 || height == 0) return;
    // Keep the indicator clear of text, including empty lists.
    mui_canvas_set_draw_color(p_canvas, 0);
    mui_canvas_draw_box(p_canvas, width - 4, 0, 4, height);
    mui_canvas_set_draw_color(p_canvas, 1);
    if (!total) return;
    // Sparse track and a visible thumb, also for very large folders.
    for (uint16_t i = 0; i < height; i += 2) {
        mui_canvas_draw_dot(p_canvas, width - 2, i);
    }
    uint16_t thumb = height / total;
    if (thumb < 3) thumb = height < 3 ? height : 3;
    if (pos >= total) pos = total - 1;
    uint16_t top = total > 1 ? (pos * (height - thumb)) / (total - 1) : 0;
    mui_canvas_draw_box(p_canvas, width - 3, top, 3, thumb);
}

void mui_element_multiline_text(mui_canvas_t *p_canvas, uint8_t x, uint8_t y, const char *text) {

    uint8_t font_height = mui_canvas_current_font_height(p_canvas);
    string_t str;
    string_init(str);
    const char *start = text;
    char *end;
    do {
        end = strchr(start, '\n');
        if (end) {
            string_set_strn(str, start, end - start);
        } else {
            string_set_str(str, start);
        }
        mui_canvas_draw_utf8(p_canvas, x, y, string_get_cstr(str));
        if (end) start = end + 1;
        y += font_height;
    } while (end && y < 64);
    string_clear(str);
}

/* Measurement and rendering must share both wrapping and glyph advance.
 * GetUTF8Width measures ink, whereas DrawUTF8 advances to the next origin. */
static mui_text_size_t mui_element_text_layout(mui_canvas_t *p_canvas, uint8_t x, uint8_t y,
                                                uint8_t w, uint8_t h, const char *text, bool draw) {
    mui_text_size_t size = {0, 0};
    uint8_t font_height = mui_canvas_current_font_height(p_canvas);
    if (!text || !*text || !w || !font_height || (draw && !h)) return size;
    uint16_t xi = 0;
    uint32_t yi = 0;
    const char *p = text;
    char utf8[5];
    size.height = font_height;

    while (*p) {
        if (*p == '\n') {
            xi = 0;
            yi += font_height;
            ++p;
        } else {
            uint8_t bytes = mui_canvas_get_utf8_bytes(p);
            memcpy(utf8, p, bytes);
            utf8[bytes] = '\0';
            uint16_t ink = mui_canvas_get_utf8_width(p_canvas, utf8);
            uint16_t advance = mui_canvas_get_utf8_advance(p_canvas, utf8);
            /* An overwide first glyph is clipped by the caller, without an
             * empty leading line. Ordinary glyphs may exactly reach the edge. */
            if (xi && xi + ink > w) {
                xi = 0;
                yi += font_height;
            }
            if (draw && (yi >= h || (uint16_t)y + yi > UINT8_MAX)) break;
            if (draw && (uint16_t)x + xi <= UINT8_MAX)
                mui_canvas_draw_utf8(p_canvas, x + xi, y + yi, utf8);
            if (xi + ink > size.width) size.width = xi + ink;
            xi += advance;
            p += bytes;
        }
        if (yi > (uint32_t)UINT16_MAX - font_height) {
            size.height = UINT16_MAX;
            break;
        }
        size.height = yi + font_height;
        if (draw && yi >= h) break;
    }
    return size;
}

mui_text_size_t mui_element_text_size(mui_canvas_t *p_canvas, uint8_t w, const char *text) {
    return mui_element_text_layout(p_canvas, 0, 0, w, 0, text, false);
}

void mui_element_autowrap_text(mui_canvas_t *p_canvas, uint8_t x, uint8_t y, uint8_t w, uint8_t h, const char *text) {
    mui_element_text_layout(p_canvas, x, y, w, h, text, true);
}

/* Advance one complete character, including for malformed or truncated input. */
static uint16_t box_glyph(mui_canvas_t *canvas, const char **cursor, char glyph[5]) {
    uint8_t bytes = mui_canvas_get_utf8_bytes(*cursor);
    memcpy(glyph, *cursor, bytes);
    glyph[bytes] = '\0';
    *cursor += bytes;
    return mui_canvas_get_utf8_width(canvas, glyph);
}

uint16_t mui_element_autowrap_text_box(mui_canvas_t *p_canvas, uint16_t x, uint16_t y, uint16_t w, uint16_t h,
                                       uint16_t page_height, uint16_t offset_y, uint8_t square_r, const char *text) {

    if (w <= 4 || !h) return 0;
    /* Visible glyph descent can extend beyond the logical scroll page. */
    if (!page_height) page_height = h;
    mui_rect_t clip_win_prev;
    mui_rect_t clip_win_cur;
    mui_canvas_get_clip_window(p_canvas, &clip_win_prev);
    clip_win_cur.x = x;
    clip_win_cur.y = y;
    clip_win_cur.w = w;
    clip_win_cur.h = h;
    mui_canvas_set_clip_window(p_canvas, &clip_win_cur);

    uint8_t font_height = mui_canvas_current_font_height(p_canvas);
    uint16_t text_y = y + font_height;
    uint16_t yi = text_y;

    const char *p = text;
    char utf8[5];

    while (*p) {
        uint16_t wi = w - 4; /* Reserve the scrollbar on every line. */
        if (yi < text_y + square_r) {
            wi = wi > square_r ? wi - square_r : 0;
        }
        const char *end = p, *space = NULL, *hyphen = NULL;
        uint16_t used = 0;
        while (*end && *end != '\n') {
            const char *start = end;
            uint16_t width = box_glyph(p_canvas, &end, utf8);
            if (*start == ' ' && start != p) space = start;
            if (used + width > wi && start != p) {
                end = space ? space : (hyphen ? hyphen : start);
                break;
            }
            used += width + 1;
            if (*start == '-') hyphen = end;
        }
        /* Revisit only visible glyphs. The baseline may be just outside the
         * viewport while the tops/descenders are still inside the clip. */
        if (yi > offset_y && yi - offset_y <= UINT8_MAX &&
            yi - offset_y + font_height >= y && yi - offset_y < y + h + font_height) {
            uint16_t xi = x;
            while (p < end) {
                uint16_t width = box_glyph(p_canvas, &p, utf8);
                mui_canvas_draw_utf8(p_canvas, xi, yi - offset_y, utf8);
                xi += width + 1;
            }
        }
        p = end;
        if (!*p) break;
        if (*p == ' ') {
            while (*p == ' ') ++p;
            if (!*p) break;
        }
        if (*p == '\n') ++p;
        yi += font_height;
    }

    uint16_t total = (yi - y + page_height - 1) / page_height;
    uint16_t pos = offset_y / page_height;

    if (total > 1) {
        pos = pos < total - 1 ? pos : total - 1;

        // scrollbar
        uint8_t width = x + w;
        uint8_t height = h;
        // prevent overflows
        mui_canvas_set_draw_color(p_canvas, 0);
        mui_canvas_draw_box(p_canvas, width - 4, y, 4, height);
        // dot line
        mui_canvas_set_draw_color(p_canvas, 1);
        for (uint8_t i = y; i < y + height; i += 2) {
            mui_canvas_draw_dot(p_canvas, width - 2, i);
        }
        // Position block
        if (total) {
            /* Round the shared edges once. The last page ends at y+height
             * even when the viewport height is not divisible by the page count. */
            uint16_t top = (uint32_t)height * pos / total;
            uint16_t bottom = (uint32_t)height * (pos + 1u) / total;
            mui_canvas_draw_box(p_canvas, width - 3, y + top, 3, bottom > top ? bottom - top : 1u);
        }
    }

    // mui_canvas_draw_line(p_canvas, x, y, x + w, y);
    mui_canvas_set_clip_window(p_canvas, &clip_win_prev);
    return yi - y;
}

uint16_t mui_element_text_height(mui_canvas_t *p_canvas, uint8_t w, const char *text) {
    return mui_element_text_size(p_canvas, w, text).height;
}

void mui_element_button(mui_canvas_t *p_canvas, uint8_t x, uint8_t y, const char *str, uint8_t selected) {
    uint8_t font_height = mui_canvas_current_font_height(p_canvas);
    uint8_t canvas_width = mui_canvas_get_width(p_canvas);
    uint8_t canvas_height = mui_canvas_get_height(p_canvas);
    uint8_t button_width = mui_canvas_get_utf8_width(p_canvas, str);

    if (selected) {
        mui_canvas_set_draw_color(p_canvas, 1);
        mui_canvas_draw_box(p_canvas, x, y + 2, button_width + 4, font_height + 2);
        mui_canvas_set_draw_color(p_canvas, 0);
        mui_canvas_draw_utf8(p_canvas, x + 2, y + font_height, str);
        mui_canvas_set_draw_color(p_canvas, 1);
    } else {
        mui_canvas_set_draw_color(p_canvas, 1);
        mui_canvas_draw_rframe(p_canvas, x, y + 2, button_width + 4, font_height, 1);
        mui_canvas_draw_utf8(p_canvas, x + 2, y + font_height, str);
    }
}
