"""Actual canvas functions: clipping, glyph advance, bounded UTF-8 text walking.

PIXL_CANVAS_BASE can select the preserved source for negative controls. Peripheral
rendering is mocked; these tests do not measure the physical LCD response time.
"""
from pathlib import Path
import os
import unittest
from root_host import HostTests, SRC, function

CANVAS = Path(os.environ.get('PIXL_CANVAS_BASE', SRC / 'mui/mui_canvas.c'))


class CanvasBoundsTests(HostTests):
    def test_multiline_without_trailing_newline(self):
        source = (SRC / 'mui/mui_element.c').read_text(encoding='utf-8')
        self.compile_run(r'''
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
typedef struct { int unused; } mui_canvas_t;
typedef char string_t[80];
static unsigned draws, clears;
static char lines[10][80];
static uint8_t mui_canvas_current_font_height(mui_canvas_t *c) { return 8; }
static void string_init(char *s) { s[0]=0; }
static void string_set_strn(char *s,const char *text,size_t n) { assert(n<80);memcpy(s,text,n);s[n]=0; }
static void string_set_str(char *s,const char *text) { string_set_strn(s,text,strlen(text)); }
static const char *string_get_cstr(const char *s) { return s; }
static void string_clear(char *s) { ++clears; }
static uint8_t mui_canvas_draw_utf8(mui_canvas_t *c,uint8_t x,uint8_t y,const char *s) {
    assert(draws<10);strcpy(lines[draws++],s);return strlen(s);
}
''' + function(source, 'mui_element_multiline_text') + r'''
int main(void) {
    mui_canvas_t c={0};
    mui_element_multiline_text(&c,0,0,"first\nlast");
    assert(draws==2 && clears==1 && !strcmp(lines[0],"first") && !strcmp(lines[1],"last"));
    draws=0;mui_element_multiline_text(&c,0,0,"");assert(draws==1 && clears==2 && !lines[0][0]);
    draws=0;mui_element_multiline_text(&c,0,56,"last\nclipped");assert(draws==1 && clears==3);
    puts("PASS multiline termination and cleanup");return 0;
}
''')

    def test_clip_round_trip_and_glyph_advance(self):
        source = CANVAS.read_text(encoding='utf-8')
        names = ('mui_canvas_set_frame', 'mui_canvas_set_clip_window',
                 'mui_canvas_get_clip_window', 'mui_canvas_draw_glyph')
        self.compile_run(r'''
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
typedef struct { uint16_t clip_x0, clip_y0, clip_x1, clip_y1; } u8g2_t;
typedef struct { u8g2_t *fb; uint8_t offset_x, offset_y, width, height; } mui_canvas_t;
typedef struct { uint8_t x,y,w,h; } mui_rect_t;
static unsigned glyph_x, glyph_y, glyph_encoding;
static void u8g2_SetClipWindow(u8g2_t *fb, unsigned x0, unsigned y0, unsigned x1, unsigned y1) {
    fb->clip_x0=x0; fb->clip_y0=y0; fb->clip_x1=x1; fb->clip_y1=y1;
}
static uint16_t u8g2_DrawGlyph(u8g2_t *fb, unsigned x, unsigned y, unsigned encoding) {
    glyph_x=x; glyph_y=y; glyph_encoding=encoding; return 11;
}
''' + '\n'.join(function(source, name) for name in names) + r'''
int main(void) {
    unsigned cases=0; u8g2_t fb={0}; mui_canvas_t c={.fb=&fb};
    for (unsigned ox=0; ox<=16; ox+=4) for (unsigned oy=0; oy<=8; oy+=2)
    for (unsigned w=1; w<=100; w+=9) for (unsigned h=1; h<=40; h+=3) {
        mui_canvas_set_frame(&c, ox, oy, 128-ox, 64-oy);
        mui_rect_t outer, first={3,5,w,h}, saved, inner={5,8,7,9};
        mui_canvas_get_clip_window(&c,&outer);
        assert(outer.x==0 && outer.y==0 && outer.w==128-ox && outer.h==64-oy);
        mui_canvas_set_clip_window(&c,&first);
        assert(fb.clip_x0==ox+3 && fb.clip_y0==oy+5);
        assert(fb.clip_x1==ox+3+w && fb.clip_y1==oy+5+h);
        mui_canvas_get_clip_window(&c,&saved);
        assert(saved.x==first.x && saved.y==first.y && saved.w==w && saved.h==h);
        mui_canvas_set_clip_window(&c,&inner);
        mui_canvas_set_clip_window(&c,&saved);
        assert(fb.clip_x1==ox+3+w && fb.clip_y1==oy+5+h);
        mui_canvas_set_clip_window(&c,&outer);
        assert(fb.clip_x0==ox && fb.clip_y0==oy && fb.clip_x1==128 && fb.clip_y1==64);
        assert(mui_canvas_draw_glyph(&c,7,11,0xe21f)==11);
        assert(glyph_x==ox+7 && glyph_y==oy+11 && glyph_encoding==0xe21f);
        ++cases;
    }
    printf("PASS %u clip/glyph cases\n",cases); return 0;
}
''')

    def test_valid_and_truncated_utf8_actual_walkers(self):
        source = CANVAS.read_text(encoding='utf-8')
        element = (SRC / 'mui/mui_element.c').read_text(encoding='utf-8')
        self.compile_run(r'''
#include <assert.h>
#include <stdint.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <stdbool.h>
typedef struct { uint8_t width; } mui_canvas_t;
typedef struct { uint16_t width, height; } mui_text_size_t;
static unsigned drawn;
static uint8_t mui_canvas_draw_utf8(mui_canvas_t *c, uint8_t x, uint8_t y, const char *s) {
    assert(strlen(s)>=1 && strlen(s)<=4); ++drawn; return 6;
}
static uint16_t mui_canvas_get_utf8_width(mui_canvas_t *c,const char *s) {
    assert(strlen(s)>=1 && strlen(s)<=4); return 6;
}
static uint16_t mui_canvas_get_utf8_advance(mui_canvas_t *c,const char *s) { return 6; }
static uint8_t mui_canvas_current_font_height(mui_canvas_t *c) { return 8; }
''' + '\n'.join(function(source, name) for name in
                      ('mui_canvas_get_utf8_bytes', 'mui_canvas_draw_utf8_clip'))
                         + function(element, 'mui_element_text_layout')
                         + function(element, 'mui_element_autowrap_text') + r'''
static unsigned cases;
static void check(const unsigned char *bytes, size_t len, unsigned expected) {
    /* Exact heap allocation makes an access past the NUL observable under ASan. */
    char *s=malloc(len+1); assert(s); memcpy(s,bytes,len); s[len]=0;
    assert(mui_canvas_get_utf8_bytes(s)==expected);
    const char *p=s; unsigned walked=0;
    while (*p) {
        unsigned n=mui_canvas_get_utf8_bytes(p);
        assert(n>=1 && n<=4 && n<=strlen(p)); p+=n; ++walked;
    }
    assert(p==s+len);
    mui_canvas_t canvas={128}; drawn=0;
    mui_canvas_draw_utf8_clip(&canvas,0,10,s);
    assert(drawn==walked);
    drawn=0; mui_element_autowrap_text(&canvas,0,0,128,64,s);
    /* The small inputs have no newline and fit the mock screen. */
    assert(drawn==walked);
    free(s); ++cases;
}
int main(void) {
    assert(mui_canvas_get_utf8_bytes(NULL)==0);
    assert(mui_canvas_get_utf8_bytes("")==0);
    const unsigned char valid[][5]={{'A',0},{0xc2,0x80,0},{0xdf,0xbf,0},
        {0xe0,0xa0,0x80,0},{0xe2,0x82,0xac,0},{0xed,0x9f,0xbf,0},{0xef,0xbf,0xbf,0},
        {0xf0,0x90,0x80,0x80,0},{0xf1,0x80,0x80,0x80,0},{0xf4,0x8f,0xbf,0xbf,0}};
    for(unsigned i=0;i<sizeof(valid)/sizeof(valid[0]);++i) {
        size_t n=strlen((const char*)valid[i]); check(valid[i],n,n);
        for(size_t cut=1;cut<n;++cut) check(valid[i],cut,1);
    }
    /* Every possible first byte, with an immediate terminator. */
    for(unsigned a=1;a<256;++a) if(a!='\n') { unsigned char s[]={a}; check(s,1,1); }
    /* All first/second byte combinations, including malformed continuations. */
    for(unsigned a=128;a<256;++a) for(unsigned b=1;b<256;++b) if(b!='\n') {
        unsigned char s[]={a,b};
        check(s,2,(a>=0xc2 && a<=0xdf && b>=0x80 && b<=0xbf)?2:1);
    }
    const unsigned char bad[][5]={{0xe0,0x9f,0x80,0},{0xed,0xa0,0x80,0},
        {0xf0,0x8f,0xbf,0xbf,0},{0xf4,0x90,0x80,0x80,0},{0xf5,0x80,0x80,0x80,0},
        {0xe2,'A',0x80,0},{0xf0,0x90,'A',0x80,0}};
    for(unsigned i=0;i<sizeof(bad)/sizeof(bad[0]);++i) check(bad[i],strlen((const char*)bad[i]),1);
    printf("PASS %u UTF8 boundary/walker cases\n",cases); return 0;
}
''')


if __name__ == '__main__':
    unittest.main()
