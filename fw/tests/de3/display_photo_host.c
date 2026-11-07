#include <assert.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include "df_proto_info.h"
#include "u8g2.h"
#include "mbedtls/sha256.h"

typedef struct { bool initialized; u8g2_t u8g2; } mui_t;
static mui_t ui;
static u8x8_display_info_t display;
static uint8_t pixels[1024];
static bool idle = true;
static df_frame_t reply;
static unsigned sent;
static mui_t *mui(void) { return &ui; }
static bool df_proto_vfs_is_idle(void) { return idle; }
void df_core_send_frame(df_frame_t *frame) { reply = *frame; sent++; }
void mbedtls_platform_zeroize(void *data, size_t length) {
    volatile unsigned char *p = data;
    while (length--) *p++ = 0;
}

/* PRODUCTION_HANDLER */

static void expect_error(df_event_t *event) {
    unsigned before = sent;
    df_proto_handler_info_display_page(event);
    assert(sent == before + 1 && reply.status == DF_STATUS_ERR && reply.length == 0);
}

int main(void) {
    ui.initialized = true;
    ui.u8g2.tile_buf_ptr = pixels;
    ui.u8g2.tile_buf_height = 8;
    ui.u8g2.u8x8.display_info = &display;
    display.tile_width = 16;
    for (unsigned i = 0; i < sizeof(pixels); i++) pixels[i] = (uint8_t)(i / 128 + 17 * i);
    df_frame_t request = {.cmd = DF_PROTO_CMD_INFO_DISPLAY_PAGE, .data = "LCD1", .length = 5};
    df_event_t event = {.type = DF_EVENT_DATA_RECEVIED, .df = &request};
    uint8_t digest[32];
    for (uint8_t page = 0; page < 8; page++) {
        request.data[4] = page;
        df_proto_handler_info_display_page(&event);
        assert(sent == (unsigned)page + 1 && reply.cmd == 10 && reply.status == DF_STATUS_OK);
        assert(reply.length == 168 && reply.chunk == 0 && memcmp(reply.data, "PXLC", 4) == 0);
        assert(reply.data[4] == 1 && reply.data[5] == page && reply.data[6] == 128 && reply.data[7] == 64);
        assert(memcmp(reply.data + 40, pixels + 128 * page, 128) == 0);
        if (page == 0) memcpy(digest, reply.data + 8, 32);
        assert(memcmp(digest, reply.data + 8, 32) == 0);
    }
    /* Changing another page must still invalidate this page's digest. */
    pixels[0] ^= 1;
    df_proto_handler_info_display_page(&event);
    assert(reply.length == 168 && memcmp(digest, reply.data + 8, 32) != 0);
    assert(memcmp(reply.data + 40, pixels + 7 * 128, 128) == 0);
    request.data[4] = 8; expect_error(&event); request.data[4] = 0;
    request.data[0] = 'Z'; expect_error(&event); request.data[0] = 'L';
    request.length = 4; expect_error(&event); request.length = 6; expect_error(&event); request.length = 5;
    request.status = 1; expect_error(&event); request.status = 0;
    request.chunk = 1; expect_error(&event); request.chunk = 0;
    idle = false; expect_error(&event); idle = true;
    ui.initialized = false; expect_error(&event); ui.initialized = true;
    display.tile_width = 15; expect_error(&event); display.tile_width = 16;
    ui.u8g2.tile_buf_height = 1; expect_error(&event); ui.u8g2.tile_buf_height = 8;
    ui.u8g2.tile_buf_ptr = NULL; expect_error(&event);
    unsigned before = sent;
    event.type = DF_EVENT_DATA_TRANSMIT_READY; df_proto_handler_info_display_page(&event);
    event.type = DF_EVENT_LINK_DISCONNECTED; df_proto_handler_info_display_page(&event);
    assert(sent == before);
    for (unsigned i = 0; i < 32; i++) printf("%02x", digest[i]);
    puts("");
    return 0;
}
