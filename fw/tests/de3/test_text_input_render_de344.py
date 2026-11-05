"""Real text editor drawing, production fonts and U8g2; no display hardware."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest
from root_host import FW, SRC, function

LIBS = ['u8g2_setup.c','u8g2_font.c','u8g2_hvline.c','u8g2_ll_hvline.c','u8g2_box.c',
        'u8g2_intersection.c','u8g2_line.c','u8g2_kerning.c','u8x8_8x8.c','u8g2_buffer.c',
        'u8g2_bitmap.c','u8g2_circle.c','u8x8_setup.c','u8x8_display.c','u8x8_cad.c',
        'u8x8_byte.c','u8x8_gpio.c','u8x8_capture.c','u8x8_u16toa.c','u8x8_u8toa.c']

HARNESS = r'''
#include "mui_canvas.h"
#include "m-string.h"
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define ENTER_KEY '\r'
#define CANCEL_KEY '\x1b'
#define getLangString(key) "Abbrechen"
#define BACKSPACE_KEY '\b'
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"line %u: %s\n",__LINE__,#x); exit(73); } } while (0)
typedef struct { void *user_data; } mui_view_t;
typedef struct { string_t input_text,header; unsigned focus_row,focus_column; bool clear_default_text; } mui_text_input_t;
extern const uint8_t u8g2_font_wqy12_t_gb2312a[],u8g2_font_siji_t_6x10[];
static const char *input, *tail;
static unsigned tail_x,tail_width,cursor_x,cursor_width;
uint8_t original_draw_utf8(mui_canvas_t *,uint8_t,uint8_t,const char *);
uint8_t mui_canvas_draw_utf8(mui_canvas_t *c,uint8_t x,uint8_t y,const char *s) {
    if (y == 22 && (uintptr_t)s >= (uintptr_t)input && (uintptr_t)s <= (uintptr_t)(input + strlen(input))) {
        tail=s; tail_x=x; tail_width=mui_canvas_get_utf8_width(c,s);
    }
    if (y == 22 && !strcmp(s,"_")) { cursor_x=x;cursor_width=mui_canvas_get_utf8_width(c,s); }
    return original_draw_utf8(c,x,y,s);
}
/*ACTUAL_KEYBOARD*/
/*ACTUAL_DRAW*/
static const u8x8_display_info_t display_info={.tile_width=16,.tile_height=8,.pixel_width=128,.pixel_height=64};
static void save_frame(const char *path,const uint8_t *buf) {
    if (!path) return;
    FILE *f=fopen(path,"wb");CHECK(f);fprintf(f,"P1\n128 64\n");
    for (unsigned y=0;y<64;y++)for(unsigned x=0;x<128;x++)
        fprintf(f,"%u%c",!!(buf[(y/8)*128+x] & (1U<<(y%8))),x==127?'\n':' ');
    fclose(f);
}
int main(int argc,char **argv) {
    u8g2_t u={0};uint8_t buf[1024]={0};mui_canvas_t canvas={0};
    u.u8x8.display_info=&display_info;
    u8g2_SetupBuffer(&u,buf,8,u8g2_ll_hvline_vertical_top_lsb,&u8g2_cb_r0);
    canvas.fb=&u;mui_canvas_set_frame(&canvas,0,0,128,64);
    mui_text_input_t ti={0};string_init(ti.input_text);string_init(ti.header);string_set_str(ti.header,"Name");
    mui_view_t view={.user_data=&ti};
    const char *samples[]={"", "Mario", "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", "a long name ending in Maerchen",
        "\xc3\xa4\xc3\xb6\xc3\xbc\xc3\x9f long name with \xc3\xa4\xc3\xb6\xc3\xbc", "\xe4\xb8\xad\xe6\x96\x87\xe4\xb8\xad\xe6\x96\x87\xe4\xb8\xad\xe6\x96\x87\xe4\xb8\xad\xe6\x96\x87\xe4\xb8\xad\xe6\x96\x87\xe4\xb8\xad\xe6\x96\x87"};
    unsigned cases=0;
    for (unsigned i=0;i<sizeof(samples)/sizeof(samples[0]);i++)for(unsigned marked=0;marked<2;marked++) {
        string_set_str(ti.input_text,samples[i]);ti.clear_default_text=marked;input=string_get_cstr(ti.input_text);
        tail=NULL;tail_x=tail_width=cursor_x=cursor_width=0;memset(buf,0,sizeof(buf));
        mui_text_input_on_draw(&view,&canvas);
        if(argc>1 && i==2 && marked==0)save_frame(argv[1],buf);
        CHECK(tail!=NULL);
        printf("case%u marked%u offset%u text_end%u cursor_end%u\n",i,marked,(unsigned)(tail-input),tail_x+tail_width,cursor_x+cursor_width);
        CHECK(!*tail || ((unsigned char)*tail & 0xc0)!=0x80);
        CHECK(tail_x+tail_width <= 123);
        if(!marked) CHECK(cursor_x+cursor_width <= 124);
        CHECK(!strcmp(string_get_cstr(ti.input_text),samples[i]));
        cases++;
    }
    string_clear(ti.input_text);string_clear(ti.header);
    printf("PASS %u actual font editor frames: UTF8 boundaries, text/cursor fit and unchanged input\n",cases);
    return 0;
}
'''

class EditorRenderingTests(unittest.TestCase):
    def test_actual_editor_fonts_utf8_and_cursor_fit(self):
        source=Path(os.environ.get('PIXL_EDITOR_SOURCE',SRC/'mui/view/mui_text_input.c')).read_text(encoding='utf-8')
        code=HARNESS.replace('/*ACTUAL_KEYBOARD*/',source[source.index('#define LIST_ITEM_HEIGHT'):source.index('static void mui_text_input_on_draw')])
        code=code.replace('/*ACTUAL_DRAW*/',function(source,'mui_text_input_on_draw'))
        with tempfile.TemporaryDirectory(prefix='pixl-editor-render-') as tmp:
            folder=Path(tmp)
            for name in ('mui_canvas.h','mui_input.h','u8g2_font_wqy12_t_gb2312a.c','u8g2_font_siji_t_6x10.c'):
                shutil.copyfile(SRC/'mui'/name,folder/name)
            (folder/'mui_common.h').write_text('#pragma once\n#include <stdbool.h>\n#include <stdint.h>\n#include <string.h>\n#include "u8g2.h"\n')
            (folder/'mui_u8g2.h').write_text('#include "u8g2.h"\n')
            canvas=(SRC/'mui/mui_canvas.c').read_text().replace('uint8_t mui_canvas_draw_utf8(', 'uint8_t original_draw_utf8(')
            (folder/'mui_canvas.c').write_text(canvas)
            (folder/'main.c').write_text(code,encoding='utf-8')
            u8=FW/'components/u8g2/csrc';binary=folder/'test.exe'
            cmd=['gcc','-std=c11','-O1','-g','-Wno-unused-variable','-I',str(folder),'-I',str(u8),'-I',str(FW/'components/mlib')]
            if os.environ.get('PIXL_SANITIZE')=='1':cmd += ['-fsanitize=address,undefined','-fno-sanitize-recover=all']
            cmd += [str(folder/n) for n in ('main.c','mui_canvas.c','u8g2_font_wqy12_t_gb2312a.c','u8g2_font_siji_t_6x10.c')]
            cmd += [str(u8/n) for n in LIBS]+['-o',str(binary)]
            build=subprocess.run(cmd,capture_output=True,text=True,timeout=120)
            self.assertEqual(build.returncode,0,build.stdout+build.stderr)
            run=[str(binary)]
            if os.environ.get('PIXL_EDITOR_RENDER'):run.append(os.environ['PIXL_EDITOR_RENDER'])
            result=subprocess.run(run,capture_output=True,text=True,timeout=60)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            print(result.stdout)

if __name__=='__main__':unittest.main()
