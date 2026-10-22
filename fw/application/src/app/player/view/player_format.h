#ifndef PLAYER_FORMAT_H
#define PLAYER_FORMAT_H
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#define PLAYER_HEADER_MAGIC 0x50495856u
#define PLAYER_HEADER_BYTES 16u
#define PLAYER_MAX_FPS 60u
typedef struct {
    uint32_t magic;
    uint16_t frame_count;
    uint16_t fps;
    uint16_t width;
    uint16_t height;
    uint32_t reserved;
} v_header_t;
static inline uint16_t player_read_le16(const uint8_t *p) {
    return (uint16_t)p[0] | ((uint16_t)p[1] << 8);
}
static inline uint32_t player_read_le32(const uint8_t *p) {
    return (uint32_t)player_read_le16(p) | ((uint32_t)player_read_le16(p + 2) << 16);
}
/* PIXV has a fixed little-endian header and row-padded XBM frames. */
static inline bool player_parse_header(const uint8_t *raw, size_t raw_size, size_t file_size,
                                      uint16_t max_width, uint16_t max_height,
                                      v_header_t *header, size_t *frame_size) {
    if (!raw || !header || !frame_size || raw_size != PLAYER_HEADER_BYTES) return false;
    v_header_t parsed = {.magic = player_read_le32(raw), .frame_count = player_read_le16(raw + 4),
                         .fps = player_read_le16(raw + 6), .width = player_read_le16(raw + 8),
                         .height = player_read_le16(raw + 10), .reserved = player_read_le32(raw + 12)};
    if (parsed.magic != PLAYER_HEADER_MAGIC || parsed.reserved != 0 || parsed.frame_count == 0 ||
        parsed.fps == 0 || parsed.fps > PLAYER_MAX_FPS || parsed.width == 0 || parsed.height == 0 ||
        parsed.width > max_width || parsed.height > max_height) return false;
    size_t stride = ((size_t)parsed.width + 7u) / 8u;
    if (stride > SIZE_MAX / parsed.height) return false;
    size_t bytes = stride * parsed.height;
    if (bytes > (SIZE_MAX - PLAYER_HEADER_BYTES) / parsed.frame_count ||
        file_size != PLAYER_HEADER_BYTES + bytes * parsed.frame_count) return false;
    *header = parsed;
    *frame_size = bytes;
    return true;
}
#endif
