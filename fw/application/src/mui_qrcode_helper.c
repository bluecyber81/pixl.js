#include "mui_qrcode_helper.h"

/* Version 4 needs 33 symbol modules plus eight quiet-zone modules. Keep both
 * buffers bounded: full version-40 buffers would consume almost the8KiB stack. */
#define MUI_QRCODE_MAX_VERSION 4
#define MUI_QRCODE_BORDER 4

void printQr(const uint8_t qrcode[], mui_canvas_t *p_canvas, uint8_t x0, uint8_t y0, uint8_t maxsize) {
    if (!qrcode || !p_canvas || (unsigned)x0 + maxsize > mui_canvas_get_width(p_canvas) ||
        (unsigned)y0 + maxsize > mui_canvas_get_height(p_canvas)) return;
    uint8_t color = mui_canvas_get_draw_color(p_canvas);
    int size = qrcodegen_getSize(qrcode);
    int full_size = size + 2 * MUI_QRCODE_BORDER;
    int scale = maxsize / full_size;
    if (scale == 0) return;
    int inset = (maxsize - full_size * scale) / 2;
    /* Paint every pixel, including surplus margins. All coordinates stay
     * nonnegative; the old negative border wrapped through uint8_t at y=0. */
    for (int y = 0; y < maxsize; y++) {
        for (int x = 0; x < maxsize; x++) {
            bool inside = x >= inset && y >= inset &&
                          x < inset + full_size * scale && y < inset + full_size * scale;
            bool dark = inside && qrcodegen_getModule(qrcode,
                (x - inset) / scale - MUI_QRCODE_BORDER,
                (y - inset) / scale - MUI_QRCODE_BORDER);
            mui_canvas_set_draw_color(p_canvas, dark ? 1 : 0);
            mui_canvas_draw_dot(p_canvas, x0 + x, y0 + y);
        }
    }
    mui_canvas_set_draw_color(p_canvas, color);
}

bool draw_qrcode(mui_canvas_t *p_canvas, uint8_t x, uint8_t y, uint8_t maxsize, const char *text) {
    if (!p_canvas || !text || maxsize < 29 ||
        (unsigned)x + maxsize > mui_canvas_get_width(p_canvas) ||
        (unsigned)y + maxsize > mui_canvas_get_height(p_canvas)) return false;
    int max_version = (maxsize - 17 - 2 * MUI_QRCODE_BORDER) / 4;
    if (max_version > MUI_QRCODE_MAX_VERSION) max_version = MUI_QRCODE_MAX_VERSION;
    enum qrcodegen_Ecc errCorLvl = qrcodegen_Ecc_LOW; // Error correction level

    // Make and print the QR Code symbol
    uint8_t qrcode[qrcodegen_BUFFER_LEN_FOR_VERSION(MUI_QRCODE_MAX_VERSION)];
    uint8_t tempBuffer[qrcodegen_BUFFER_LEN_FOR_VERSION(MUI_QRCODE_MAX_VERSION)];
    bool ok = qrcodegen_encodeText(text, tempBuffer, qrcode, errCorLvl, qrcodegen_VERSION_MIN, max_version,
                                   qrcodegen_Mask_AUTO, true);
    if (ok) printQr(qrcode, p_canvas, x, y, maxsize);
    return ok;
}
