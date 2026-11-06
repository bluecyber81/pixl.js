#include "lcd_drv.h"
#include "bitmap.h"
#include "lcd_comm.h"
#include <stdbool.h>
#include <string.h>

#include "nrf_log.h"
#include "nrf_delay.h"
#include <stdio.h>

#include "boards.h"

#ifdef OLED_TYPE_SH1106
#define LCD_X_SIZE 132
#else
#define LCD_X_SIZE 128
#endif
#define LCD_Y_SIZE 64
#define LCD_VISIBLE_X_SIZE 128

static bool m_screen_enabled = true;
static uint8_t m_display_content[LCD_Y_SIZE / 8][LCD_X_SIZE];

void lcd_init(void) {
    lcd_comm_init();
    lcd_reset(); // 硬复位
#ifdef OLED_TYPE_SH1106
    lcd_write_command(0xAE); /*display off*/
    lcd_write_command(0x02); /*set lower column address*/
    lcd_write_command(0x10); /*set higher column address*/
    lcd_write_command(0x40); /*set display start line*/
    lcd_write_command(0xB0); /*set page address*/
    lcd_write_command(0x81); /*contract control*/
    lcd_write_command(0xcf); /*128*/
    lcd_write_command(0xA1); /*set segment remap*/
    lcd_write_command(0xA6); /*normal / reverse*/
    lcd_write_command(0xA8); /*multiplex ratio*/
    lcd_write_command(0x3F); /*duty = 1/64*/
    lcd_write_command(0xad); /*set charge pump enable*/
    lcd_write_command(0x8b); /* 0x8B ÄÚ¹© VCC */
    lcd_write_command(0x33); /*0X30---0X33 set VPP 9V */
    lcd_write_command(0xC8); /*Com scan direction*/
    lcd_write_command(0xD3); /*set display offset*/
    lcd_write_command(0x00); /* 0x20 */
    lcd_write_command(0xD5); /*set osc division*/
    lcd_write_command(0x80);
    lcd_write_command(0xD9); /*set pre-charge period*/
    lcd_write_command(0x1f); /*0x22*/
    lcd_write_command(0xDA); /*set COM pins*/
    lcd_write_command(0x12);
    lcd_write_command(0xdb); /*set vcomh*/
    lcd_write_command(0x40);
    lcd_clear();
    lcd_write_command(0xAF); /*display ON*/

#else
    lcd_write_command(0xe2); // 软复位
    /* Match the application LCD soft-reset settling time. */
    nrf_delay_ms(50);
    lcd_write_command(0xa2); // 升压电路,电压管理电路
    lcd_write_command(0xa0); // 0x20~0x27 为V5电压内部电阻调整设置
    lcd_write_command(0xc8); // 设置EV 对比度
    lcd_write_command(0x23); // 对比度值

    lcd_write_command(0x81); // 0x01~0x3f电量寄存器设置模式

    lcd_write_command(0x32); // 0xa0为Segment正向, 0xa1为Segment反向
    lcd_write_command(0x2f); // 0xc0正向扫描, 0xc8反向扫描
    lcd_write_command(0xb0); // 0xa6正向显示, 0xa7反向显示
    lcd_write_command(0xAF); // 0xa4正常显示, 0xa5全屏显示
    lcd_write_command(0xA6); // 背压比设置
    // lcd_write_command(0x10);		//背压比值:0~10
    // lcd_write_command(0xaf);		//开显示
#endif
}

void lcd_uninit() { lcd_comm_uninit(); }

static void lcd_set_pos(uint8_t page, uint8_t column) {
    lcd_write_command(0xb0 + (0x07 & page));
    lcd_write_command(0x10 | column >> 4);
    lcd_write_command(column & 0x0f);
}

void lcd_show_pic(uint8_t col, uint8_t row, uint8_t width, uint8_t high, const uint8_t *data) {
    if (!m_screen_enabled || width == 0 || high == 0 || col >= LCD_X_SIZE || row >= LCD_Y_SIZE) return;

    /* Source is page-major, LSB at the top. The caller supplies
     * width * ceil(high / 8) bytes, not overlapping the internal framebuffer.
     * Keep the original source stride when clipping.
     * NULL clears the rectangle. Compose directly in the existing framebuffer;
     * no allocation (or allocation-failure path) is needed during DFU. */
    uint8_t real_width = width;
    if (real_width > LCD_X_SIZE - col) real_width = LCD_X_SIZE - col;
    uint16_t end_row = (uint16_t)row + high;
    if (end_row > LCD_Y_SIZE) end_row = LCD_Y_SIZE;
    uint8_t first_page = row / 8;
    uint8_t end_page = (end_row + 7) / 8;
    uint8_t shift = row % 8;

    for (uint8_t page = first_page; page < end_page; page++) {
        uint8_t source_page = page - first_page;
        uint8_t mask = 0xff;
        if (page == first_page) mask &= (uint8_t)(0xffu << shift);
        if (page == end_page - 1 && end_row % 8) mask &= (uint8_t)((1u << (end_row % 8)) - 1u);
        for (uint8_t x = 0; x < real_width; x++) {
            uint8_t pixels = 0;
            if (data != NULL) {
                if ((uint16_t)source_page * 8 < high)
                    pixels = (uint8_t)(data[(uint16_t)source_page * width + x] << shift);
                if (shift && source_page)
                    pixels |= data[(uint16_t)(source_page - 1) * width + x] >> (8 - shift);
            }
            uint8_t *target = &m_display_content[page][col + x];
            *target = (*target & (uint8_t)~mask) | (pixels & mask);
        }
        lcd_set_pos(page, col);
        lcd_write_data(&m_display_content[page][col], real_width);
    }
}

static void lcd_flush_frame(void) {
    for (uint8_t page = 0; page < LCD_Y_SIZE / 8; page++) {
        lcd_set_pos(page, 0);
        lcd_write_data(m_display_content[page], LCD_X_SIZE);
    }
}

void lcd_clear(void) {
    if (!m_screen_enabled) return;
    memset(m_display_content, 0, sizeof(m_display_content));
    lcd_flush_frame();
}

static uint8_t font_index(uint8_t chr) {
    /* The bootloader displays only fixed status strings. Keep the exact
     * required glyphs and a bounded fallback for every other input byte. */
    for (uint8_t i = 0; i < BOOT_FONT_GLYPH_COUNT; i++) {
        if (boot_font_chars[i] == chr) return i;
    }
    return 0; /* '?' is the first compact glyph. */
}

/* The DFU screen has two fixed, page-aligned rows. Each glyph is stored as
 * two consecutive 8-byte pages. Limit text to complete visible glyphs. */
static void compose_status_line(uint8_t page, uint8_t x, const char *text) {
    while (x <= LCD_VISIBLE_X_SIZE - 8 && *text) {
        const uint8_t *glyph = ascii_1608[font_index((uint8_t)*text++)];
        memcpy(&m_display_content[page][x], glyph, 8);
        memcpy(&m_display_content[page + 1][x], glyph + 8, 8);
        x += 8;
    }
}

void lcd_draw_dfu_status(uint8_t title_x, const char *title, uint8_t detail_x, const char *detail) {
    if (!m_screen_enabled) return;
    memset(m_display_content, 0, sizeof(m_display_content));
    compose_status_line(2, title_x, title);
    compose_status_line(4, detail_x, detail);
    lcd_flush_frame();
}

void show_char_0608(uint8_t x, uint8_t y, uint8_t chr) {
    lcd_show_pic(x, y, 6, 8, figure_6x8_str[font_index(chr)]);
}

void lcd_show_char(uint8_t x, uint8_t y, uint8_t chr) {
    lcd_show_pic(x, y, 8, 16, ascii_1608[font_index(chr)]);
}

/* Specialize each fixed-width caller so the linker can discard an unused
 * font path. Keep both public APIs and all clipping checks intact. */
static inline __attribute__((always_inline)) void draw_text(uint8_t x, uint8_t y, const uint8_t *data, uint8_t len, uint8_t char_width, bool terminated) {
    if (data == NULL || y >= LCD_Y_SIZE) return;
    /* Widen the running column so a long string cannot wrap back onto the LCD.
     * Only read characters that can contribute pixels to the visible screen. */
    uint16_t column = x;
    for (uint8_t i = 0; i < len && column < LCD_VISIBLE_X_SIZE; i++, column += char_width) {
        if (terminated && data[i] == 0) break;
        if (char_width == 6) show_char_0608((uint8_t)column, y, data[i]);
        else lcd_show_char((uint8_t)column, y, data[i]);
    }
}

void show_str_0608(uint8_t x, uint8_t y, uint8_t *data, uint8_t len) { draw_text(x, y, data, len, 6, false); }

void show_str_1608(uint8_t x, uint8_t y, uint8_t *data, uint8_t len) {
    draw_text(x, y, data, len, 8, false);
}

void lcd_show_font(uint8_t x, uint8_t y, uint8_t t_x, uint8_t t_y, uint8_t *font) {
    lcd_show_pic(x, y, t_x, t_y, font);
}

void lcd_draw_str_0608(uint8_t x, uint8_t y, char *str) { draw_text(x, y, (const uint8_t *)str, UINT8_MAX, 6, true); }

void lcd_draw_str_1608(uint8_t x, uint8_t y, char *str) { draw_text(x, y, (const uint8_t *)str, UINT8_MAX, 8, true); }
