//
// Created by jumkey on 2023/9/2.
//

#ifndef MUI_QRCODE_HELPER_H
#define MUI_QRCODE_HELPER_H

#include "mui_canvas.h"
#include "qrcodegen.h"

/* x/y and maxsize describe the entire square, including the four-module quiet
 * zone. Nothing is drawn when it cannot fit completely inside the canvas. */
bool draw_qrcode(mui_canvas_t *p_canvas, uint8_t x, uint8_t y, uint8_t maxsize, const char *text);

#endif // MUI_QRCODE_HELPER_H
