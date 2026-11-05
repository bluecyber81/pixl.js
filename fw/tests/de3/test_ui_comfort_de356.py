"""Actual keyboard draw/input and scrollbar code, production fonts and U8g2.

No radio, hardware or physical LCD timing is simulated. Optional PBM frames are
emitted only when PIXL_UI_COMFORT_RENDER names an existing output directory.
"""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest

from root_host import FW, SRC, function
from test_text_input_render_de344 import LIBS


HARNESS = r'''
#include "mui_canvas.h"
#include "mui_text_input.h"
#include <ctype.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"line %u: %s\n",__LINE__,#x); exit(73); } } while (0)
#define getLangString(key) "Abbrechen"
#define LV_MIN(a,b) ((a)<(b)?(a):(b))
#define LV_MAX(a,b) ((a)>(b)?(a):(b))
enum {INPUT_TYPE_SHORT,INPUT_TYPE_LONG,INPUT_TYPE_REPEAT};
enum {INPUT_KEY_LEFT,INPUT_KEY_RIGHT,INPUT_KEY_CENTER};
extern const uint8_t u8g2_font_wqy12_t_gb2312a[],u8g2_font_siji_t_6x10[];
static unsigned key_x,key_y,key_glyph,seen_hint,scroll_mode,boxes,dots,thumb_y,thumb_h;
static const char *expected_hint;
uint8_t original_draw_utf8(mui_canvas_t *,uint8_t,uint8_t,const char *);
uint8_t original_draw_glyph(mui_canvas_t *,uint8_t,uint8_t,uint16_t);
void original_draw_box(mui_canvas_t *,uint8_t,uint8_t,uint8_t,uint8_t);
void original_draw_dot(mui_canvas_t *,uint8_t,uint8_t);
uint8_t mui_canvas_draw_utf8(mui_canvas_t *c,uint8_t x,uint8_t y,const char *s) {
    if (y==10 && expected_hint && !strcmp(s,expected_hint)) seen_hint++;
    return original_draw_utf8(c,x,y,s);
}
uint8_t mui_canvas_draw_glyph(mui_canvas_t *c,uint8_t x,uint8_t y,uint16_t g) {
    if (x==key_x && y==key_y) key_glyph=g;
    return original_draw_glyph(c,x,y,g);
}
void mui_canvas_draw_box(mui_canvas_t *c,uint8_t x,uint8_t y,uint8_t w,uint8_t h) {
    if (scroll_mode) {
        CHECK((unsigned)x+w<=c->width && (unsigned)y+h<=c->height);
        boxes++;
        if (mui_canvas_get_draw_color(c)==1) {thumb_y=y;thumb_h=h;}
    }
    original_draw_box(c,x,y,w,h);
}
void mui_canvas_draw_dot(mui_canvas_t *c,uint8_t x,uint8_t y) {
    if (scroll_mode) { CHECK(x<c->width && y<c->height); dots++; }
    original_draw_dot(c,x,y);
}
/*ACTUAL_KEYBOARD*/
/*ACTUAL_FUNCTIONS*/
/*ACTUAL_SCROLLBAR*/
/*ACTUAL_ROW*/
static const u8x8_display_info_t display_info={.tile_width=16,.tile_height=8,.pixel_width=128,.pixel_height=64};
static void save_frame(const char *directory,const char *name,const uint8_t *buf) {
    if (!directory) return;
    char path[2048]; CHECK(snprintf(path,sizeof(path),"%s/%s.pbm",directory,name)>0);
    FILE *f=fopen(path,"wb");CHECK(f);fprintf(f,"P1\n128 64\n");
    for (unsigned y=0;y<64;y++)for(unsigned x=0;x<128;x++)
        fprintf(f,"%u%c",!!(buf[(y/8)*128+x] & (1U<<(y%8))),x==127?'\n':' ');
    fclose(f);
}
static unsigned confirmations, cancellations;
static void dispose(mui_text_input_event_t event,mui_text_input_t *input) {
    CHECK(event==MUI_TEXT_INPUT_EVENT_CONFIRMED || event==MUI_TEXT_INPUT_EVENT_CANCELLED);
    input->p_view->user_data=NULL;
    free(input); /* ASan detects a handler that still accesses the editor on return. */
}
static void confirmed(mui_text_input_event_t event,mui_text_input_t *input) {
    CHECK(input);
    if(event==MUI_TEXT_INPUT_EVENT_CONFIRMED) confirmations++; else {CHECK(event==MUI_TEXT_INPUT_EVENT_CANCELLED);cancellations++;}
}
static void press(mui_text_input_t *input,int type) {
    mui_input_event_t e={type,INPUT_KEY_CENTER};mui_text_input_on_input(input->p_view,&e);
}
static void redraw(mui_text_input_t *input,mui_canvas_t *canvas,uint8_t *buffer,char key) {
    mui_text_input_set_focus_key(input,key);
    const mui_text_input_key_t *selected=&get_row(input->focus_row)[input->focus_column];
    key_x=keyboard_origin_x+selected->x;key_y=keyboard_origin_y+selected->y;
    key_glyph=0;seen_hint=0;memset(buffer,0,1024);
    mui_text_input_on_draw(input->p_view,canvas);
    CHECK(key_glyph==(unsigned char)key);
}
int main(int argc,char **argv) {
    u8g2_t u={0};uint8_t buffer[1024]={0};mui_canvas_t canvas={0};
    u.u8x8.display_info=&display_info;
    u8g2_SetupBuffer(&u,buffer,8,u8g2_ll_hvline_vertical_top_lsb,&u8g2_cb_r0);
    canvas.fb=&u;mui_canvas_set_frame(&canvas,0,0,128,64);
    mui_canvas_set_font(&canvas,u8g2_font_wqy12_t_gb2312a);
    const char *values[]={"[AN]","[AUS]","[ON]","[OFF]"};
    const char *titles[]={"Fernbedienung (bis Aus)","Schnelles Aufwachen","漢字漢字漢字漢字漢字漢字"};
    for(unsigned t=0;t<3;t++)for(unsigned v=0;v<4;v++){
        unsigned x=mui_list_view_value_x(128,mui_canvas_get_utf8_width(&canvas,values[v]));CHECK(x>13);
        uint8_t reference[1024];memset(buffer,0,1024);
        original_draw_utf8(&canvas,x,10,values[v]);memcpy(reference,buffer,sizeof(reference));
        for(int step=0;step<=4;step++){
            memset(buffer,0,1024);mui_list_view_draw_row_text(&canvas,0,-step*12,titles[t],values[v]);
            CHECK(!memcmp(buffer+x-2,reference+x-2,128-x+2));
            CHECK(!memcmp(buffer+128+x-2,reference+128+x-2,128-x+2));
        }
    }
    if (argc>1) {
        memset(buffer,0,1024);
        mui_list_view_draw_row_text(&canvas,0,0,titles[0],values[1]);
        mui_list_view_draw_row_text(&canvas,13,0,titles[1],values[0]);
        save_frame(argv[1],"settings-value-rows",buffer);
    }
    u8g2_SetClipWindow(&u,93,1,108,8);
    mui_list_view_draw_row_text(&canvas,0,-10,titles[0],values[0]);
    CHECK(u.clip_x0==93 && u.clip_x1==108 && u.clip_y0==1 && u.clip_y1==8);
    u8g2_SetMaxClipWindow(&u);
    mui_text_input_t input={0};mui_view_t view={.user_data=&input};input.p_view=&view;
    string_init(input.input_text);string_init(input.header);string_set_str(input.header,"Dateiname");
    input.event_cb=confirmed;

    // Every letter must draw exactly the character that a short press inserts.
    // A held middle press remains uppercase in empty and nonempty fields.
    unsigned cases=0;
    for(char key='a';key<='z';key++)for(unsigned nonempty=0;nonempty<2;nonempty++) {
        char hint[]={key,'/',key-'a'+'A',0};expected_hint=hint;
        string_set_str(input.input_text,nonempty?"Mario":"");
        redraw(&input,&canvas,buffer,key);CHECK(seen_hint==1);
        press(&input,INPUT_TYPE_SHORT);
        const char *result=string_get_cstr(input.input_text);
        CHECK(result[nonempty?5:0]==key && result[(nonempty?5:0)+1]==0);
        string_set_str(input.input_text,nonempty?"Mario":"");
        press(&input,INPUT_TYPE_LONG);for(unsigned r=0;r<6;r++)press(&input,INPUT_TYPE_REPEAT);
        result=string_get_cstr(input.input_text);CHECK(result[(nonempty?5:0)+1]==0);
        CHECK(result[nonempty?5:0]==key-'a'+'A');cases++;
    }
    expected_hint="q/Q";string_set_str(input.input_text,"");redraw(&input,&canvas,buffer,'q');
    save_frame(argc>1?argv[1]:NULL,"keyboard-empty",buffer);
    string_set_str(input.input_text,"Mario");redraw(&input,&canvas,buffer,'q');
    save_frame(argc>1?argv[1]:NULL,"keyboard-name",buffer);
    expected_hint="_/SP";redraw(&input,&canvas,buffer,'_');CHECK(seen_hint==1);
    save_frame(argc>1?argv[1]:NULL,"keyboard-space",buffer);
    press(&input,INPUT_TYPE_SHORT);CHECK(!strcmp(string_get_cstr(input.input_text),"Mario_"));
    press(&input,INPUT_TYPE_LONG);CHECK(!strcmp(string_get_cstr(input.input_text),"Mario_ "));
    expected_hint=NULL;redraw(&input,&canvas,buffer,'7');CHECK(seen_hint==0);
    press(&input,INPUT_TYPE_SHORT);press(&input,INPUT_TYPE_LONG);
    CHECK(!strcmp(string_get_cstr(input.input_text),"Mario_ 77"));
    input.max_length=string_size(input.input_text);press(&input,INPUT_TYPE_SHORT);
    CHECK(!strcmp(string_get_cstr(input.input_text),"Mario_ 77"));
    mui_text_input_set_focus_key(&input,BACKSPACE_KEY);press(&input,INPUT_TYPE_SHORT);
    CHECK(!strcmp(string_get_cstr(input.input_text),"Mario_ 7"));
    string_set_str(input.input_text,"a\xc3\xa4");press(&input,INPUT_TYPE_SHORT);
    CHECK(!strcmp(string_get_cstr(input.input_text),"a"));
    mui_text_input_set_focus_key(&input,ENTER_KEY);press(&input,INPUT_TYPE_SHORT);CHECK(confirmations==1);
    press(&input,INPUT_TYPE_LONG);for(unsigned r=0;r<6;r++)press(&input,INPUT_TYPE_REPEAT);CHECK(confirmations==2);
    expected_hint="Abbrechen";mui_text_input_set_focus_key(&input,CANCEL_KEY);seen_hint=0;
    memset(buffer,0,sizeof(buffer));mui_text_input_on_draw(&view,&canvas);CHECK(seen_hint==1);
    save_frame(argc>1?argv[1]:NULL,"keyboard-cancel",buffer);
    press(&input,INPUT_TYPE_LONG);for(unsigned r=0;r<6;r++)press(&input,INPUT_TYPE_REPEAT);
    CHECK(cancellations==1 && confirmations==2 && !strcmp(string_get_cstr(input.input_text),"a"));
    for(unsigned key=0;key<2;key++) {
        mui_text_input_t *temporary=calloc(1,sizeof(*temporary));CHECK(temporary);
        mui_view_t transient={.user_data=temporary};temporary->p_view=&transient;temporary->event_cb=dispose;
        mui_text_input_set_focus_key(temporary,key?ENTER_KEY:CANCEL_KEY);press(temporary,INPUT_TYPE_SHORT);
        CHECK(transient.user_data==NULL);
    }
    mui_text_input_set_focus_key(&input,BACKSPACE_KEY);press(&input,INPUT_TYPE_REPEAT);
    CHECK(!*string_get_cstr(input.input_text));
    input.focus_row=255;input.focus_column=255;mui_text_input_on_draw(&view,&canvas);
    input.focus_row=0;input.focus_column=0;
    string_set_str(input.header,"Ein sehr langer Titel im Eingabefeld");
    string_set_str(input.input_text,"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
    expected_hint="q/Q";redraw(&input,&canvas,buffer,'q');CHECK(seen_hint==1);
    save_frame(argc>1?argv[1]:NULL,"keyboard-long-name",buffer);

    // Compare actual hint pixels with the empty-title reference. Wide UTF-8
    // titles previously overpainted the hint, also when font width wrapped.
    // Check an offset canvas and narrower incoming clips without enlarging
    // or losing the caller's clip window for the input field and keyboard.
    const unsigned clip_windows[][4]={{0,0,128,64},{3,1,125,63},{108,0,128,64},{0,18,128,64}};
    const char hint_keys[]={'q','_'};
    unsigned header_cases=0;
    for(unsigned offset=0;offset<=3;offset+=3) {
      mui_canvas_set_frame(&canvas,offset,offset,128-offset,64-offset);
      for(unsigned ci=0;ci<sizeof(clip_windows)/sizeof(clip_windows[0]);ci++) {
        const unsigned *clip=clip_windows[ci];
        u8g2_SetClipWindow(&u,clip[0],clip[1],clip[2],clip[3]);
        for(unsigned hi=0;hi<sizeof(hint_keys);hi++) {
          char key=hint_keys[hi]; expected_hint=key=='_'?"_/SP":"q/Q";
          string_reset(input.header);redraw(&input,&canvas,buffer,key);
          uint8_t reference[1024];memcpy(reference,buffer,sizeof(reference));
          mui_canvas_set_font(&canvas,u8g2_font_wqy12_t_gb2312a);
          unsigned hint_left=offset+124-mui_canvas_get_utf8_width(&canvas,expected_hint)-2;
          for(unsigned count=1;count<=30;count++) {
            string_reset(input.header);
            for(unsigned j=0;j<count;j++)string_cat_str(input.header,"\xe4\xb8\xad");
            redraw(&input,&canvas,buffer,key);
            CHECK(u.clip_x0==clip[0] && u.clip_y0==clip[1] && u.clip_x1==clip[2] && u.clip_y1==clip[3]);
            // Only the title may change: the hint and all lower rows must
            // remain byte-for-byte equivalent at the pixel level.
            for(unsigned yy=0;yy<64;yy++)for(unsigned xx=0;xx<128;xx++) {
              if(yy<offset+12 && xx<hint_left)continue;
              unsigned bit=1U<<(yy%8),index=(yy/8)*128+xx;
              CHECK((buffer[index]&bit)==(reference[index]&bit));
            }
            header_cases++;
          }
        }
      }
    }
    mui_canvas_set_frame(&canvas,0,0,128,64);
    puts("PASS: 60 fixed-value pixel comparisons, clipped column, held keys, cancellation and callback disposal");
    printf("PASS: %u actual UTF-8 title/hint pixel comparisons and clip restoration cases\n",header_cases);
    string_clear(input.input_text);string_clear(input.header);

    // All canvas dimensions, including the former uint8 track-loop wrap,
    // invalid positions and 65535 entries: no division by zero/out-of-bounds.
    const unsigned widths[]={0,1,3,4,128},totals[]={0,1,2,4,100,65535};
    scroll_mode=1;unsigned scroll_cases=0;
    for(unsigned wi=0;wi<sizeof(widths)/sizeof(widths[0]);wi++)
      for(unsigned height=0;height<=255;height++)
       for(unsigned ti=0;ti<sizeof(totals)/sizeof(totals[0]);ti++)
        for(unsigned pi=0;pi<4;pi++) {
            unsigned total=totals[ti];uint32_t pos=pi==0?0:pi==1?total/2:pi==2?(total?total-1:0):UINT32_MAX;
            canvas.width=widths[wi];canvas.height=height;boxes=dots=thumb_y=thumb_h=0;
            mui_element_scrollbar(&canvas,pos,total);scroll_cases++;
            if (canvas.width<4 || !height) {CHECK(boxes==0 && dots==0);continue;}
            if (!total) {CHECK(boxes==1 && dots==0);continue;}
            CHECK(boxes==2 && dots==(height+1)/2);
            CHECK(thumb_h>0 && thumb_h<=height && thumb_y+thumb_h<=height);
            CHECK(thumb_h>=(height<3?height:3));
            if (!pos || total==1) CHECK(thumb_y==0);
            if (pos>=total-1) CHECK(thumb_y+thumb_h==height);
        }
    printf("PASS: %u real keyboard case/hold scenarios plus editor bounds and %u scrollbar boundary scenarios\n",cases,scroll_cases);
    return 0;
}
'''


class ComfortRenderingTests(unittest.TestCase):
    def test_actual_keyboard_and_scrollbar(self):
        source = (SRC / 'mui/view/mui_text_input.c').read_text(encoding='utf-8')
        code = HARNESS.replace('/*ACTUAL_KEYBOARD*/', source[source.index('#define LIST_ITEM_HEIGHT'):source.index('static void mui_text_input_on_draw')])
        code = code.replace('/*ACTUAL_FUNCTIONS*/', '\n'.join(function(source, name) for name in (
            'mui_text_input_on_draw', 'mui_text_input_on_input', 'mui_text_input_set_focus_key')))
        code = code.replace('/*ACTUAL_SCROLLBAR*/', function((SRC / 'mui/mui_element.c').read_text(), 'mui_element_scrollbar'))
        rows = (SRC / 'mui/view/mui_list_view.c').read_text()
        code = code.replace('/*ACTUAL_ROW*/', '\n'.join(function(rows, name) for name in (
            'mui_list_view_value_x', 'mui_list_view_draw_row_text')))
        with tempfile.TemporaryDirectory(prefix='pixl-ui-comfort-') as tmp:
            folder = Path(tmp)
            for name in ('mui_canvas.h', 'u8g2_font_wqy12_t_gb2312a.c', 'u8g2_font_siji_t_6x10.c'):
                shutil.copyfile(SRC / 'mui' / name, folder / name)
            shutil.copyfile(SRC / 'mui/view/mui_text_input.h', folder / 'mui_text_input.h')
            (folder / 'mui_common.h').write_text('#pragma once\n#include <stdbool.h>\n#include <stdint.h>\n#include <string.h>\n#include "u8g2.h"\n')
            (folder / 'mui_u8g2.h').write_text('#include "u8g2.h"\n')
            (folder / 'mui_include.h').write_text('#pragma once\n#include "mui_canvas.h"\n#include "m-string.h"\ntypedef struct {void *user_data;} mui_view_t;\ntypedef struct {int type,key;} mui_input_event_t;\n')
            canvas = (SRC / 'mui/mui_canvas.c').read_text()
            for name in ('draw_utf8', 'draw_glyph', 'draw_box', 'draw_dot'):
                canvas = canvas.replace('mui_canvas_' + name + '(', 'original_' + name + '(', 1)
            (folder / 'mui_canvas.c').write_text(canvas)
            (folder / 'main.c').write_text(code, encoding='utf-8')
            u8 = FW / 'components/u8g2/csrc'
            binary = folder / 'test.exe'
            cmd = ['gcc', '-std=c11', '-O1', '-g', '-Wno-unused-variable', '-I', str(folder), '-I', str(u8), '-I', str(FW / 'components/mlib')]
            if os.environ.get('PIXL_SANITIZE') == '1':
                cmd += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all']
            cmd += [str(folder / n) for n in ('main.c', 'mui_canvas.c', 'u8g2_font_wqy12_t_gb2312a.c', 'u8g2_font_siji_t_6x10.c')]
            cmd += [str(u8 / n) for n in LIBS] + ['-o', str(binary)]
            build = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            self.assertEqual(build.returncode, 0, build.stdout + build.stderr)
            command = [str(binary)]
            if os.environ.get('PIXL_UI_COMFORT_RENDER'):
                command.append(os.environ['PIXL_UI_COMFORT_RENDER'])
            result = subprocess.run(command, capture_output=True, text=True, timeout=60)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            print(result.stdout)


if __name__ == '__main__':
    unittest.main()
