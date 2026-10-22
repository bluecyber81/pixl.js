#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "vfs_meta.h"
#include "df_buffer.h"

static void empty(const vfs_meta_t *meta) {
    assert(!meta->has_notes && !meta->has_flags && !meta->has_amiibo_id);
    assert(meta->notes[0] == 0 && meta->flags == 0 && meta->amiibo_head == 0 && meta->amiibo_tail == 0);
}
static void invalid(uint8_t *data, uint8_t size) {
    struct { uint32_t before; vfs_meta_t value; uint32_t after; } guarded;
    memset(&guarded, 0xa5, sizeof(guarded));
    vfs_meta_decode(data, size, &guarded.value);
    empty(&guarded.value);
    assert(guarded.before == 0xa5a5a5a5 && guarded.after == 0xa5a5a5a5);
}

int main(void) {
    vfs_meta_t input = {.has_notes=true, .notes="abc", .has_flags=true,
        .flags=VFS_OBJ_FLAG_HIDDEN | VFS_OBJ_FLAG_READONLY,
        .has_amiibo_id=true, .amiibo_head=0x11223344, .amiibo_tail=0x55667788};
    uint8_t wire[128];
    const uint8_t expected[] = {16,1,3,'a','b','c',2,5,3,0x44,0x33,0x22,0x11,0x88,0x77,0x66,0x55};
    memset(wire, 0xa5, sizeof(wire));
    vfs_meta_encode(wire, sizeof(wire), &input);
    assert(memcmp(wire, expected, sizeof(expected)) == 0);
    for (size_t i = sizeof(expected); i < sizeof(wire); ++i) assert(wire[i] == 0);
    vfs_meta_t decoded;
    vfs_meta_decode(wire, sizeof(wire), &decoded);
    assert(decoded.has_notes && strcmp(decoded.notes, "abc") == 0);
    assert(decoded.has_flags && decoded.flags == 5);
    assert(decoded.has_amiibo_id && decoded.amiibo_head == input.amiibo_head && decoded.amiibo_tail == input.amiibo_tail);
    puts("PASS metadata roundtrip, exact legacy wire bytes and zeroed padding");

    for (unsigned size = 0; size < sizeof(expected); ++size) invalid(wire, (uint8_t)size);
    invalid(NULL, 0);
    invalid(NULL, 128);
    vfs_meta_decode(wire, sizeof(wire), NULL);
    uint8_t none[] = {0}, erased[] = {255}, absent_length[] = {1,1};
    uint8_t absent_flags[] = {1,2}, short_id[] = {8,3,1,2,3,4,5,6,7};
    uint8_t bad_notes[] = {4,1,90,'a','b'}, unknown[] = {3,2,5,4};
    invalid(none, sizeof(none)); invalid(erased, sizeof(erased));
    invalid(absent_length, sizeof(absent_length)); invalid(absent_flags, sizeof(absent_flags));
    invalid(short_id, sizeof(short_id)); invalid(bad_notes, sizeof(bad_notes)); invalid(unknown, sizeof(unknown));
    puts("PASS zero size, erased records, short fields, malformed lengths and unknown fields");

    uint8_t long_notes[95];
    long_notes[0]=94; long_notes[1]=1; long_notes[2]=90;
    memset(long_notes+3, 'x', 90); long_notes[93]=2; long_notes[94]=5;
    vfs_meta_decode(long_notes, sizeof(long_notes), &decoded);
    assert(decoded.has_notes && strlen(decoded.notes)==89 && decoded.notes[89]==0);
    assert(decoded.has_flags && decoded.flags==5);
    uint8_t zero_note[] = {2,1,0};
    vfs_meta_decode(zero_note, sizeof(zero_note), &decoded);
    assert(decoded.has_notes && decoded.notes[0]==0);
    memset(input.notes, 'y', sizeof(input.notes));
    vfs_meta_encode(wire, sizeof(wire), &input);
    assert(wire[2]==89 && wire[0]==102);
    vfs_meta_decode(wire, sizeof(wire), &decoded);
    assert(strlen(decoded.notes)==89 && decoded.has_flags && decoded.has_amiibo_id);
    puts("PASS nonterminated/maximal notes stay bounded and decode always NUL-terminates");

    strcpy(input.notes, "abc");
    for (unsigned cap=0; cap<sizeof(expected); ++cap) {
        uint8_t guarded[130]; memset(guarded, 0xa5, sizeof(guarded));
        vfs_meta_encode(guarded+1, (uint8_t)cap, &input);
        assert(guarded[0]==0xa5 && guarded[cap+1]==0xa5);
        for (unsigned i=1; i<=cap; ++i) assert(guarded[i]==0);
    }
    vfs_meta_encode(NULL, 128, &input);
    memset(wire, 0xa5, sizeof(wire));
    vfs_meta_encode(wire, 128, NULL);
    for (unsigned i=0; i<128; ++i) assert(wire[i]==0);
    puts("PASS insufficient encoding capacity and null/zero-capacity destinations");

    const uint8_t numbers[] = {0x34,0x12,0x78,0x56,0x34,0x12,0x08,0x07,0x06,0x05,0x04,0x03,0x02,0x01};
    for (unsigned offset=0; offset<8; ++offset) {
        uint8_t guarded[32]; memset(guarded, 0xa5, sizeof(guarded));
        NEW_BUFFER(out, guarded+offset+1, 14);
        buff_put_u16(&out, 0x1234); buff_put_u32(&out, 0x12345678); buff_put_u64(&out, UINT64_C(0x0102030405060708));
        assert(out.limit==14 && memcmp(guarded+offset+1, numbers, 14)==0);
        assert(guarded[offset]==0xa5 && guarded[offset+15]==0xa5);
        NEW_BUFFER_READ(in, guarded+offset+1, 14);
        assert(buff_get_u16(&in)==0x1234 && buff_get_u32(&in)==0x12345678);
        assert(buff_get_u64(&in)==UINT64_C(0x0102030405060708) && in.pos==14);
        assert(buff_set_limit(&in, 14)==14);
    }
    puts("PASS unaligned u16/u32/u64 at every alignment with exact little-endian wire bytes");

    uint32_t seed=12345;
    for (unsigned n=0; n<40000; ++n) {
        uint8_t size=(uint8_t)(n%256);
        uint8_t *data=size?malloc(size):NULL;
        for (unsigned i=0; i<size; ++i) { seed=seed*1664525u+1013904223u; data[i]=(uint8_t)(seed>>24); }
        vfs_meta_decode(data, size, &decoded);
        if (decoded.has_notes) assert(memchr(decoded.notes, 0, sizeof(decoded.notes))!=NULL);
        uint8_t output[255];
        vfs_meta_encode(output, size, &decoded);
        free(data);
    }
    puts("PASS 40000 exact-sized metadata fuzz cases");
    return 0;
}
