#ifndef LCD_DRV_H
#define LCD_DRV_H

#include "stdint.h"

typedef enum{
	ASCII_T_1208_S,
	ASCII_T_1608_S,
	ASCII_T_2012_S,
	ASCII_T_2416_S,
}ascii_size_t;

typedef enum{
	GBK_T_12_S,
	GBK_T_16_S,
	GBK_T_20_S,
}gbk_size_t;

typedef enum{
		PIC_NUM_P_1208,
		PIC_NUM_2016,
		PIC_NUM_4028,
		PIC_NUM_P_4028,
}pic_num_t;

void lcd_init(void);
void lcd_uninit(void);
/* Drain a display update refused by the SDK scheduler. Main context only. */
void dfu_display_process(void);
void lcd_clear(void);
/* Fixed DFU status rows. Both texts must be valid NUL-terminated strings. */
void lcd_draw_dfu_status(uint8_t title_x, const char *title, uint8_t detail_x, const char *detail);


void lcd_draw_str_0608(uint8_t x, uint8_t y, char *str);
void lcd_draw_str_1608(uint8_t x, uint8_t y, char *str);

#endif //LCD_DRV_H

