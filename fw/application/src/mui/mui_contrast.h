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

/* Controller register target, not a measured percentage of emitted light. */
static inline uint8_t mui_contrast_raw(int32_t value) {
    uint8_t percent = mui_contrast_percent(value);
#ifdef OLED_SCREEN
    /* The SH1106 controls segment current. Give the lower UI settings
     * more of the dim range and retain the full register range at 100%. */
    return ((uint32_t)percent * percent * 255u + 5000u) / 10000u;
#else
    if (!percent) percent = 1;
    return ((uint32_t)percent - 1u) * 255u / 99u;
#endif
}

#endif
