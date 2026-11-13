#ifndef AMIIBO_INFO_DRAW_H
#define AMIIBO_INFO_DRAW_H
#include "mui_canvas.h"
#include "mui_input.h"
#include "ntag_def.h"

/* Longest verified public product URL plus NUL. Kept on the caller's stack. */
#define AMIIBO_INFO_URL_CAPACITY 80

/* page0 is the normal detail view,1 is public information,2 is its QR link.
 * The caller owns the existing view; this helper allocates nothing. */
void amiibo_info_draw(mui_canvas_t *canvas, const ntag_t *tag, uint8_t page);
bool amiibo_info_input(uint8_t *page, const mui_input_event_t *event);
bool amiibo_info_url(char *out, size_t capacity, const ntag_t *tag);

/* Persistent middle-button hint for active tags. On a full-height LCD the
 * description reserves nine rows; a stationary QR keeps its complete area. */
#define AMIIBO_ACTIVE_HINT_HEIGHT 9
void amiibo_active_menu_hint(mui_canvas_t *canvas, uint8_t width);
#endif
