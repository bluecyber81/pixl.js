#ifndef PIXL_STREAM_CODEC_H
#define PIXL_STREAM_CODEC_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define STREAM_FRAME_BYTES 1024u
/* PR479 wire format, with strict validation. Foreground owns both buffers;
 * no allocation, screen access or partial image publication in the decoder. */
typedef struct {
    uint8_t encoded[STREAM_FRAME_BYTES];
    uint8_t frame[STREAM_FRAME_BYTES];
    uint16_t expected, used, last_payload;
    uint8_t state, flags;
    bool has_frame;
} stream_codec_t;

void stream_codec_reset(stream_codec_t *codec);
unsigned stream_codec_feed(stream_codec_t *codec, const uint8_t *data, size_t length);
#endif
