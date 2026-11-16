#ifndef MUI_CONTRAST_H
#define MUI_CONTRAST_H

#include <stdint.h>
#include "boards.h"

#ifdef LCD_SCREEN
/* Lowest usable setting on the LCD, as in the original hardware driver. */
#define MUI_CONTRAST_MIN_PERCENT 60
#else
#define MUI_CONTRAST_MIN_PERCENT 0
#endif

static inline uint8_t mui_contrast_percent(int32_t value) {
    if (value < MUI_CONTRAST_MIN_PERCENT) return MUI_CONTRAST_MIN_PERCENT;
    if (value > 100) return 100;
    return (uint8_t)value;
}

#endif
