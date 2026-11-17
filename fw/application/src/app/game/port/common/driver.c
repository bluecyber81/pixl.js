#include "driver.h"
#include "app_error.h"
#include "game_view.h"
#include "mui_core.h"
#include "mui_u8g2.h"

#include "app_scheduler.h"
#include "boards.h"
#include "nrf_log.h"
#include "nrf_log_ctrl.h"

/* Send a rendered page while the display owns the shared SPI bus. Pixel
 * calculation happens before acquiring it, with application IRQs enabled. */
void JOY_OLED_write_page(uint8_t page, uint8_t *pixels, uint8_t count) {
    if (!pixels || count == 0 || count > 128 || page >= 8) return;
    uint8_t column = u8g2_GetU8x8(&mui()->u8g2)->x_offset;
    /* U8g2 rotates the menu in software. Keep the panel's own origin
     * (SH1106: column 2) when drawing full or partial rotated rows. */
    if (mui()->u8g2.cb == U8G2_R2) {
        page = 7 - page;
        column += 128 - count;
        for (unsigned x = 0; x < (count + 1u) / 2; ++x) {
            unsigned opposite = count - 1u - x;
            uint8_t first = pixels[x];
            pixels[x] = (uint8_t)(__RBIT(pixels[opposite]) >> 24);
            pixels[opposite] = (uint8_t)(__RBIT(first) >> 24);
        }
    }
    uint8_t address[] = {(uint8_t)(0xb0 | page), (uint8_t)(0x10 | (column >> 4)), (uint8_t)(column & 0x0f)};
    spi_transaction_t tx = {.p_tx_buffer = address, .tx_length = sizeof(address)};
    spi_device_t *display = mui_u8g2_get_spi_device();
    hal_spi_bus_aquire(display);
    nrf_gpio_pin_write(LCD_DC_PIN, 0);
    uint32_t result = hal_spi_bus_xfer(&tx);
    if (result == NRF_SUCCESS) {
        nrf_gpio_pin_write(LCD_DC_PIN, 1);
        tx.p_tx_buffer = pixels;
        tx.tx_length = count;
        result = hal_spi_bus_xfer(&tx);
    }
    hal_spi_bus_release(display);
    APP_ERROR_CHECK(result);
}

void JOY_OLED_clear(void) {
    uint8_t pixels[128] = {0};
    for (uint8_t page = 0; page < 8; page++) {
        JOY_OLED_write_page(page, pixels, sizeof(pixels));
    }
}

void JOY_init() { JOY_OLED_clear(); }

void JOY_idle() {
    app_sched_execute();
    mui_tick(mui());
    NRF_LOG_FLUSH();
}

uint8_t JOY_exit() {
    return game_view_center_key_repeat_cnt() > 10; // about 3 sec
}

uint32_t JOY_clock_ticks(void) { return app_timer_cnt_get(); }

/* Tris used the wall time of unbuffered SPI as its only gameplay clock.
 * The physics runs twice per partial redraw. Subtract actual processing time,
 * handle RTC rollover and never accumulate catch-up steps after a slow frame. */
void JOY_pace_tris_step(uint32_t start) {
    for (unsigned wait = 0; wait < 8; ++wait) {
        if (app_timer_cnt_diff_compute(JOY_clock_ticks(), start) >= APP_TIMER_TICKS(8)) break;
        DLY_ms(1);
    }
}

long map(long x, long in_min, long in_max, long out_min, long out_max) {
    return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

// Pseudo random number generator
uint16_t rnval = 0xACE1;
uint16_t JOY_random(void) {
    rnval = (rnval >> 0x01) ^ (-(rnval & 0x01) & 0xB400);
    return rnval;
}

// Buzzer
void JOY_sound(uint8_t freq, uint8_t dur) {
    //   while(dur--) {
    //     #if JOY_SOUND == 1
    //     if(freq) PIN_low(PIN_BEEP);
    //     #endif
    //     DLY_us(255 - freq);
    //     PIN_high(PIN_BEEP);
    //     DLY_us(255 - freq);
    //   }
}
