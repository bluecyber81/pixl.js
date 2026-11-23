/* Compare the production u8g2 decoder, framebuffers and metrics for every kept
 * glyph. No hardware access and no replacement font decoder in this harness. */
#include "u8g2.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

extern const uint8_t siji_full_reference[];
extern const uint8_t u8g2_font_siji_t_6x10[];
#include "siji_required.h"

#define CHECK(c) do { if (!(c)) { fprintf(stderr, "line %u: %s\n", __LINE__, #c); exit(73); } } while (0)
static const u8x8_display_info_t display_info = {
    .tile_width = 16, .tile_height = 8, .pixel_width = 128, .pixel_height = 64
};

static void setup(u8g2_t *u, uint8_t *buffer, const uint8_t *font) {
    memset(u, 0, sizeof(*u));
    u->u8x8.display_info = &display_info;
    u8g2_SetupBuffer(u, buffer, 8, u8g2_ll_hvline_vertical_top_lsb, &u8g2_cb_r0);
    u8g2_SetFont(u, font);
}

int main(void) {
    u8g2_t old, current;
    uint8_t old_buffer[1024], current_buffer[1024];
    setup(&old, old_buffer, siji_full_reference);
    setup(&current, current_buffer, u8g2_font_siji_t_6x10);
    CHECK(u8g2_GetFontSize(siji_full_reference) == 10529);
    CHECK(u8g2_GetFontSize(u8g2_font_siji_t_6x10) == SIJI_SUBSET_BYTES);
    CHECK(!memcmp(siji_full_reference + 1, u8g2_font_siji_t_6x10 + 1, 22));

    size_t next = 0;
    for (unsigned code = 0; code <= 65535; ++code) {
        int expected = next < SIJI_REQUIRED_COUNT && siji_required[next] == code;
        CHECK(!!u8g2_IsGlyph(&current, (uint16_t)code) == expected);
        if (expected) ++next;
    }
    CHECK(next == SIJI_REQUIRED_COUNT);

    unsigned frames = 0;
    const unsigned positions[][2] = {{32, 32}, {0, 2}, {124, 63}};
    for (size_t i = 0; i < SIJI_REQUIRED_COUNT; ++i) {
        uint16_t code = siji_required[i];
        CHECK(u8g2_IsGlyph(&old, code));
        CHECK(u8g2_GetGlyphWidth(&old, code) == u8g2_GetGlyphWidth(&current, code));
        CHECK(old.font_decode.glyph_width == current.font_decode.glyph_width);
        CHECK(old.font_decode.glyph_height == current.font_decode.glyph_height);
        CHECK(old.glyph_x_offset == current.glyph_x_offset);
        CHECK(u8g2_GetAscent(&old) == u8g2_GetAscent(&current));
        CHECK(u8g2_GetDescent(&old) == u8g2_GetDescent(&current));
        CHECK(u8g2_GetMaxCharWidth(&old) == u8g2_GetMaxCharWidth(&current));
        CHECK(u8g2_GetMaxCharHeight(&old) == u8g2_GetMaxCharHeight(&current));
        for (unsigned direction = 0; direction < 4; ++direction)
        for (unsigned mode = 0; mode < 2; ++mode)
        for (unsigned color = 0; color < 3; ++color)
        for (unsigned p = 0; p < sizeof(positions) / sizeof(positions[0]); ++p) {
            memset(old_buffer, 0xa5, sizeof(old_buffer));
            memset(current_buffer, 0xa5, sizeof(current_buffer));
            u8g2_SetFontDirection(&old, direction);
            u8g2_SetFontDirection(&current, direction);
            u8g2_SetFontMode(&old, mode);
            u8g2_SetFontMode(&current, mode);
            u8g2_SetDrawColor(&old, color);
            u8g2_SetDrawColor(&current, color);
            CHECK(u8g2_DrawGlyph(&old, positions[p][0], positions[p][1], code) ==
                  u8g2_DrawGlyph(&current, positions[p][0], positions[p][1], code));
            CHECK(!memcmp(old_buffer, current_buffer, sizeof(old_buffer)));
            ++frames;
        }
    }
    printf("PASS Siji: %u glyphs, %u complete 128x64 framebuffer pairs, identical metrics; 65536 lookup checks\n",
           (unsigned)SIJI_REQUIRED_COUNT, frames);
    return 0;
}
