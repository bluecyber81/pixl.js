/* Wire-compatible with Aragamiz/pixl.js PR479, b0ade162278d4fb4cced6d8b12aaaecb71d75539.
 * Validates the complete frame before changing the reference image. */
#include "stream_codec.h"
#include <string.h>

enum { WAIT_A5, WAIT_5A, FLAGS, LENGTH_LO, LENGTH_HI, PAYLOAD, DISCARD };
enum { RAW, RLE, DELTA_RLE };

void stream_codec_reset(stream_codec_t *c) {
    c->state = WAIT_A5;
    c->expected = c->used = c->last_payload = 0;
    c->flags = 0;
    c->has_frame = false;
}

static bool rle_pass(const uint8_t *src, size_t size, uint8_t *dst, bool delta) {
    size_t si = 0, di = 0;
    while (si < size) {
        uint8_t control = src[si++];
        size_t count = control < 128 ? (size_t)control + 1 : (size_t)control - 128 + 2;
        size_t needed = control < 128 ? count : 1;
        if (count > STREAM_FRAME_BYTES - di || needed > size - si) return false;
        if (dst) {
            for (size_t i = 0; i < count; ++i) {
                uint8_t value = src[si + (control < 128 ? i : 0)];
                if (delta) dst[di + i] ^= value;
                else dst[di + i] = value;
            }
        }
        si += needed;
        di += count;
    }
    return di == STREAM_FRAME_BYTES;
}

static bool finish(stream_codec_t *c) {
    if (c->flags == RAW) {
        memcpy(c->frame, c->encoded, STREAM_FRAME_BYTES);
    } else {
        if ((c->flags == DELTA_RLE && !c->has_frame) ||
            !rle_pass(c->encoded, c->expected, NULL, false)) return false;
        (void)rle_pass(c->encoded, c->expected, c->frame, c->flags == DELTA_RLE);
    }
    c->last_payload = c->expected;
    c->has_frame = true;
    return true;
}

unsigned stream_codec_feed(stream_codec_t *c, const uint8_t *data, size_t length) {
    if (!c || (!data && length)) return 0;
    unsigned complete = 0;
    while (length--) {
        uint8_t b = *data++;
        switch (c->state) {
        case WAIT_A5:
            if (b == 0xA5) c->state = WAIT_5A;
            break;
        case WAIT_5A:
            if (b == 0x5A) c->state = FLAGS;
            else if (b != 0xA5) c->state = WAIT_A5;
            break;
        case FLAGS: c->flags = b; c->state = LENGTH_LO; break;
        case LENGTH_LO: c->expected = b; c->state = LENGTH_HI; break;
        case LENGTH_HI:
            c->expected |= (uint16_t)b << 8;
            c->used = 0;
            if (!c->expected || c->expected > STREAM_FRAME_BYTES) {
                c->has_frame = false;
                c->state = WAIT_A5;
            } else if (c->flags > DELTA_RLE || (c->flags == RAW && c->expected != STREAM_FRAME_BYTES)) {
                c->has_frame = false;
                c->state = DISCARD;
            } else c->state = PAYLOAD;
            break;
        case PAYLOAD:
            c->encoded[c->used++] = b;
            if (c->used == c->expected) {
                if (finish(c)) ++complete;
                else c->has_frame = false; /* Following deltas cannot use a lost reference. */
                c->state = WAIT_A5;
            }
            break;
        case DISCARD:
            if (++c->used == c->expected) c->state = WAIT_A5;
            break;
        default: stream_codec_reset(c); break;
        }
    }
    return complete;
}
