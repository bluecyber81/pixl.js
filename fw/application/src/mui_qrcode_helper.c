#include "mui_qrcode_helper.h"

/* The current callers show 23-byte and 43-byte URLs in 50- and 33-pixel
 * areas. They need versions 2 and 3; version 4 (33 modules) also fits the
 * smaller area. Full version-40 buffers consumed 7836 bytes of our 8 KiB
 * stack before encoder/caller frames. Keep both bounded buffers local. */
#define MUI_QRCODE_MAX_VERSION 4

// Prints the given QR Code to the console.
void printQr(const uint8_t qrcode[], mui_canvas_t *p_canvas, uint8_t x0, uint8_t y0, uint8_t maxsize) {
    uint8_t color = mui_canvas_get_draw_color(p_canvas);
    int size = qrcodegen_getSize(qrcode);
    int border = 4;
    int scale = maxsize / size;
    int scale_x = scale;
    int scale_y = scale;
    for (int y = -border; y < size + border; y++) {
        for (int x = -border; x < size + border; x++) {
            mui_canvas_set_draw_color(p_canvas, qrcodegen_getModule(qrcode, x, y) ? 1 : 0);
            if (x < 0 || x >= size) {
                scale_x = 1;
            } else {
                scale_x = scale;
            }
            if (y < 0 || y >= size) {
                scale_y = 1;
            } else {
                scale_y = scale;
            }
            for (int y1 = 0; y1 < scale_y; y1++) {
                for (int x1 = 0; x1 < scale_x; x1++) {
                    mui_canvas_draw_dot(p_canvas, x0 + x * scale + x1, y0 + y * scale + y1);
                }
            }
        }
    }
    mui_canvas_set_draw_color(p_canvas, color);
}

// Creates a single QR Code, then prints it to the console.
void draw_qrcode(mui_canvas_t *p_canvas, uint8_t x, uint8_t y, uint8_t maxsize, const char *text) {
    if (!p_canvas || !text || maxsize < qrcodegen_VERSION_MIN * 4 + 17) return;
    int max_version = (maxsize - 17) / 4;
    if (max_version > MUI_QRCODE_MAX_VERSION) max_version = MUI_QRCODE_MAX_VERSION;
    enum qrcodegen_Ecc errCorLvl = qrcodegen_Ecc_LOW; // Error correction level

    // Make and print the QR Code symbol
    uint8_t qrcode[qrcodegen_BUFFER_LEN_FOR_VERSION(MUI_QRCODE_MAX_VERSION)];
    uint8_t tempBuffer[qrcodegen_BUFFER_LEN_FOR_VERSION(MUI_QRCODE_MAX_VERSION)];
    bool ok = qrcodegen_encodeText(text, tempBuffer, qrcode, errCorLvl, qrcodegen_VERSION_MIN, max_version,
                                   qrcodegen_Mask_AUTO, true);
    if (ok) printQr(qrcode, p_canvas, x, y, maxsize);
}
