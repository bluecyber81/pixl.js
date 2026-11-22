"""Exercise the actual local bit-unpacking helper, without a device or radio."""
import re
import unittest

from root_host import FW, HostTests, function


DIRECTORY = FW / 'components/chameleon-ultra/firmware/application/src/rfid/nfctag/hf'


class ChameleonFrameLengthTests(HostTests):
    def source(self):
        text = (DIRECTORY / 'nfc_14a.c').read_text()
        table = re.search(r'const uint8_t ByteMirror\[256\] = \{.*?\};', text, re.S)
        self.assertIsNotNone(table)
        return table[0] + '\n' + function(text, 'nfc_tag_14a_unwrap_frame')

    def test_interface_retains_full_received_bit_count(self):
        header = (DIRECTORY / 'nfc_14a.h').read_text()
        declaration = re.search(r'uint\d+_t nfc_tag_14a_unwrap_frame\([^;]+;', header)
        self.assertIsNotNone(declaration)
        self.compile_run('''
#include <assert.h>
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
''' + declaration[0] + '\n' + self.source() + '''
_Static_assert(sizeof(nfc_tag_14a_unwrap_frame(NULL, 0, NULL, NULL)) == sizeof(uint16_t),
               "The receive length is a bit count and exceeds 255.");
int main(void) { puts("PASS: declaration and implementation agree on 16-bit length"); }
''')

    def test_bit_oracle_lengths_exact_buffers_and_in_place(self):
        self.compile_run(r'''
#include <assert.h>
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
''' + self.source() + r'''
/* Independent bit-by-bit oracle: eight payload bits, then one parity bit.
 * Only ordinary synthetic byte patterns are used; nothing is transmitted. */
static void set_bit(uint8_t *buffer, size_t position, unsigned value) {
    if(value) buffer[position / 8] |= (uint8_t)(1u << (position % 8));
}
static void one_case(size_t bytes, unsigned tail, unsigned seed) {
    const size_t frame_bits = bytes * 9 + tail;
    const size_t frame_bytes = (frame_bits + 7) / 8;
    const size_t data_bits = bytes * 8 + tail;
    const size_t data_bytes = (data_bits + 7) / 8;
    uint8_t *encoded = calloc(frame_bytes ? frame_bytes : 1, 1);
    uint8_t *expected = calloc(data_bytes ? data_bytes : 1, 1);
    uint8_t *output = malloc(data_bytes + 1);
    uint8_t *parity = malloc(bytes + 1);
    assert(encoded && expected && output && parity);
    memset(output, 0xa5, data_bytes + 1);
    memset(parity, 0xa5, bytes + 1);
    for(size_t i = 0; i < data_bits; i++) {
        const unsigned value = (((i / 8) * 73u + seed) >> (i % 8)) & 1u;
        set_bit(encoded, i + i / 8, value);
        set_bit(expected, i, value);
    }
    for(size_t i = 0; i < bytes; i++) set_bit(encoded, i * 9 + 8, (i + seed) & 1u);
    uint16_t actual = nfc_tag_14a_unwrap_frame(encoded, frame_bits, output, parity);
    assert(actual == data_bits);
    assert(!memcmp(output, expected, data_bytes));
    assert(output[data_bytes] == 0xa5);
    for(size_t i = 0; i < bytes; i++) assert(parity[i] == ((i + seed) & 1u));
    assert(parity[bytes] == 0xa5);
    uint8_t *in_place = malloc(frame_bytes + 1);
    assert(in_place);
    memcpy(in_place, encoded, frame_bytes);
    in_place[frame_bytes] = 0xa5;
    actual = nfc_tag_14a_unwrap_frame(in_place, frame_bits, in_place, NULL);
    assert(actual == data_bits);
    assert(!memcmp(in_place, expected, data_bytes));
    assert(in_place[frame_bytes] == 0xa5);
    assert(!memcmp(in_place + data_bytes, encoded + data_bytes, frame_bytes - data_bytes));
    free(in_place); free(parity); free(output); free(expected); free(encoded);
}
int main(void) {
    assert(nfc_tag_14a_unwrap_frame(NULL, 0, NULL, NULL) == 0);
    size_t cases = 0;
    /* Includes 31/32/33/44/56/64 bytes and every alignment up to the real
     * 257-byte receive buffer. Partial final bytes are checked as well. */
    for(size_t bytes = 0; bytes <= 228; bytes++) {
        for(unsigned tail = 0; tail <= 8; tail++) {
            if(bytes * 9 + tail > 257 * 8) continue;
            for(unsigned seed = 0; seed < 256; seed += 51) {
                one_case(bytes, tail, seed);
                cases++;
            }
        }
    }
    printf("PASS: %zu exact-buffer bit cases, each also decoded in place\n", cases);
}
''')


if __name__ == '__main__':
    unittest.main()
