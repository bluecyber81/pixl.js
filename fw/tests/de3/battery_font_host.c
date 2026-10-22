#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "u8g2.h"
/* Link-only drawing edges: width calculation must not touch display hardware. */
void u8g2_DrawHVLine(u8g2_t *u, u8g2_uint_t x, u8g2_uint_t y, u8g2_uint_t len, uint8_t dir) { assert(0); }
uint8_t u8g2_IsIntersection(u8g2_t *u, u8g2_uint_t x0, u8g2_uint_t y0, u8g2_uint_t x1, u8g2_uint_t y1) { assert(0); return 0; }
uint8_t u8x8_DrawTile(u8x8_t *u, uint8_t x, uint8_t y, uint8_t cnt, uint8_t *tile_ptr) { assert(0); return 0; }
int main(void) {
    u8g2_t font = {0};
    u8g2_SetFont(&font, u8g2_font_likeminecraft_te);
    const char *labels[] = {"3.81V", "2.18V Niedrig", "3.59V Low", "--.--V", "5.21V Niedrig"};
    for (unsigned i=0;i<sizeof(labels)/sizeof(*labels);i++) {
        unsigned width=u8g2_GetUTF8Width(&font,labels[i]);
        assert(width>0 && width<=82);
        for (const char *p=labels[i];*p;p++) assert(u8g2_GetGlyphWidth(&font,(unsigned char)*p)>0);
        printf("FONT %s: %u px\n",labels[i],width);
    }
    assert(u8g2_GetAscent(&font)<=9 && 9-u8g2_GetDescent(&font)<13);
    puts("PASS actual firmware font: EN/DE voltage hints fit the 82x13 status area");
    return 0;
}
