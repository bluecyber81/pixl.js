"""Actual list callbacks + animation dispatcher; only timer/drawing/container mocks.

PIXL_SCROLL_BASELINE_SRC may select the preserved DE3.5 list source to
demonstrate that its motion violates the new three-second LCD reading pause.
No display, Bluetooth or device access; panel response remains a physical test.
"""
import os
from pathlib import Path
import re
import unittest
from root_host import HostTests, SRC, function


class LcdTextScrollTests(HostTests):
    def code(self, lcd):
        source = Path(os.environ.get('PIXL_SCROLL_BASELINE_SRC',
                      SRC / 'mui/view/mui_list_view.c')).read_text()
        animation = (SRC / 'mui/mui_anim.c').read_text()
        math = (SRC / 'mui/mui_math.c').read_text()
        constants = '\n'.join(re.findall(r'^#define LIST_\w+[^\n]*', source, re.M))
        helper = ''
        if 'static int32_t mui_list_view_lcd_text_path(' in source:
            helper = '#ifdef LCD_SCREEN\n' + function(source, 'mui_list_view_lcd_text_path') + '\n#endif\n'
        if 'static uint16_t mui_list_view_value_x(' in source:
            helper += function(source, 'mui_list_view_value_x') + '\n'
        update = (function(source, 'mui_list_view_update_canvas')
                  if 'static void mui_list_view_update_canvas(' in source else
                  'static void mui_list_view_update_canvas(mui_list_view_t *v, const mui_canvas_t *c) '
                  '{v->canvas_width=c->width;v->canvas_height=c->height;}')
        return ('#define LCD_SCREEN 1\n' if lcd else '') + r'''
#include <assert.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
/* Preserve compatibility with historical animation baselines used by this test. */
#pragma GCC diagnostic ignored "-Wreturn-type"
#define NRF_LOG_INFO(...) ((void)0)
#define APP_ERROR_CHECK(x) assert((x)==0)
#define APP_TIMER_TICKS(x) (x)
#define MUI_ANIM_TICK_INTERVAL_MS 20
#define MUI_ANIM_REPEAT_INFINITE 0xffff
#define LV_ANIM_RESOLUTION 1024
#define LV_ANIM_RES_SHIFT 10
#define LIST_ANIM_SCROLL 1
#define LIST_ANIM_FOCUS 0
#define INPUT_TYPE_SHORT 0
#define INPUT_TYPE_REPEAT 1
#define INPUT_TYPE_LONG 2
#define INPUT_KEY_LEFT 0
#define INPUT_KEY_RIGHT 1
#define INPUT_KEY_CENTER 2
#define MUI_LIST_VIEW_EVENT_SELECTED 0
#define MUI_LIST_VIEW_EVENT_LONG_SELECTED 1
typedef struct mui_anim_s mui_anim_t;
typedef int32_t (*mui_anim_path_cb_t)(const mui_anim_t *);
struct mui_anim_s {
 void *var;int32_t start_value,end_value,current_value;
 void (*exec_cb)(void*,int32_t);mui_anim_path_cb_t path_cb;
 uint32_t time,act_time;uint16_t repeat_cnt,run_cnt;bool auto_restart;
};
typedef struct {mui_anim_t *items[8];unsigned count;} anim_array_t;
typedef struct {anim_array_t *a;unsigned i;} anim_iter_t;
typedef anim_iter_t mui_anim_ptr_array_it_t[1];
static anim_array_t m_anim_ptr_array[1];
static bool m_anim_tmr_started;
static int m_anim_tick_tmr;
static unsigned redraws;
static int app_timer_start(int timer,unsigned ticks,void *ctx){assert(ticks==20);return 0;}
static int app_timer_stop(int timer){return 0;}
static void *mui(void){return NULL;}
static void mui_update(void *unused){redraws++;}
static void mui_anim_ptr_array_it(anim_iter_t *it,anim_array_t *a){it->a=a;it->i=0;}
static bool mui_anim_ptr_array_end_p(anim_iter_t *it){return it->i>=it->a->count;}
static mui_anim_t **mui_anim_ptr_array_ref(anim_iter_t *it){return &it->a->items[it->i];}
static void mui_anim_ptr_array_next(anim_iter_t *it){it->i++;}
static unsigned mui_anim_ptr_array_size(anim_array_t *a){return a->count;}
static void mui_anim_ptr_array_push_back(anim_array_t *a,mui_anim_t *p){assert(a->count<8);a->items[a->count++]=p;}
static void mui_anim_ptr_array_remove(anim_array_t *a,anim_iter_t *it){
 assert(it->i<a->count);memmove(a->items+it->i,a->items+it->i+1,(a->count-it->i-1)*sizeof(a->items[0]));a->count--;
}
static bool active(mui_anim_t *p){for(unsigned i=0;i<m_anim_ptr_array->count;i++)if(m_anim_ptr_array->items[i]==p)return true;return false;}
static void mui_anim_set_time(mui_anim_t *a,uint32_t t){a->time=t;}
static void mui_anim_set_values(mui_anim_t *a,int32_t s,int32_t e){a->start_value=s;a->end_value=e;a->current_value=s;}
static void mui_anim_set_auto_restart(mui_anim_t *a,bool b){a->auto_restart=b;}
static void mui_anim_set_path_cb(mui_anim_t *a,mui_anim_path_cb_t cb){a->path_cb=cb;}
int32_t lv_anim_path_linear(const mui_anim_t *a);
static int32_t lv_anim_path_ease_in_out(const mui_anim_t *a){return lv_anim_path_linear(a);}
typedef const char *string_t;
typedef struct {string_t text,sub_text;void *user_data;} mui_list_item_t;
/* RAM diagnostics are tested with their real implementation in test_ui_nav_diag;
 * scrolling keeps its original timer/render assertions and only stubs this hook. */
static void mui_nav_diag_list(uint8_t type,uint32_t selection,uint16_t focus){}
typedef struct {mui_list_item_t data[3];unsigned count;} item_array_t;
typedef struct {void *user_data;} mui_view_t;
typedef struct {uint8_t width,height;} mui_canvas_t;
typedef struct {int key,type;} mui_input_event_t;
typedef struct list_s mui_list_view_t;
struct list_s {
 item_array_t items[1];uint16_t focus_index,scroll_offset;
 uint8_t canvas_width,canvas_height,anim_type,first_draw,item_gap;
 int16_t text_offset,anim_value;mui_anim_t text_anim,anim,gap_anim;
 void (*selected_cb)(int,mui_list_view_t*,mui_list_item_t*);
};
static bool enabled=true;
static bool mui_list_view_anim_enabled(void){return enabled;}
static unsigned mui_list_item_array_size(item_array_t *a){return a->count;}
static mui_list_item_t *mui_list_item_array_get(item_array_t *a,unsigned i){assert(i<a->count);return &a->data[i];}
static const char *string_get_cstr(string_t s){return s?s:"0";}
/* Widths are explicit test inputs, including max uint16_t font measurements. */
static uint16_t mui_list_view_get_utf8_width(const char *s){return (uint16_t)strtoul(s,NULL,10);}
static void ignore_value(void *p,int32_t v){}
''' + constants + '\n' + function(math, 'lv_map') + '\n' + '\n'.join(
            function(animation, n) for n in ('lv_anim_path_linear', 'mui_anim_remove_ptr',
            'mui_anim_init', 'mui_anim_start', 'mui_anim_stop', 'mui_anim_tick_handler')) + '\n' + helper + '\n' + '\n'.join(
            function(source, n) for n in ('mui_list_view_start_text_anim', 'mui_list_view_text_anim_exec',
            'mui_list_view_on_input', 'mui_list_view_on_exit')) + '\n' + update + r'''
static void setup(mui_list_view_t *list){
 memset(list,0,sizeof(*list));enabled=true;
 list->canvas_width=128;list->canvas_height=64;list->first_draw=1;
 list->items->count=3;list->items->data[0].text="145";
 list->items->data[1].text="200";list->items->data[2].text="70";
 mui_anim_init(&list->text_anim);list->text_anim.var=list;
 list->text_anim.path_cb=lv_anim_path_linear;list->text_anim.exec_cb=mui_list_view_text_anim_exec;
 mui_anim_init(&list->anim);list->anim.var=list;list->anim.exec_cb=ignore_value;
 mui_anim_init(&list->gap_anim);list->gap_anim.var=list;list->gap_anim.exec_cb=ignore_value;
}
static void tick(unsigned count){while(count--)mui_anim_tick_handler();}
int main(void){
 mui_list_view_t list;setup(&list);mui_view_t view={&list};
 mui_list_view_start_text_anim(&list);assert(active(&list.text_anim));
#ifdef LCD_SCREEN
 /* Independent 3000-ms hold requirement intentionally fails against DE3.5. */
 for(unsigned i=0;i<150;i++){tick(1);assert(list.text_offset==0);}
 assert(redraws==0);
 assert(list.text_anim.time==3000+37*500);
 /* 3480 ms is still held; first visible pixel is the tick at 3500 ms. */
 tick(24);assert(list.text_offset==0 && redraws==0);
 tick(1);assert(list.text_offset==-1 && redraws==1);
 for(int pixel=2;pixel<=37;pixel++){
  int before=list.text_offset;unsigned unchanged=redraws;
  tick(24);assert(list.text_offset==before && redraws==unchanged);
  tick(1);assert(list.text_offset==-pixel && redraws==unchanged+1);
 }
 assert(list.text_offset==-37 && list.text_anim.act_time==list.text_anim.time);
 /* One 20-ms reversal tick plus 3500 ms until the first reverse pixel. */
 unsigned held=redraws;tick(151);assert(list.text_offset==-37 && redraws==held);
 tick(24);assert(list.text_offset==-37 && redraws==held);tick(1);assert(list.text_offset==-36);
 for(int offset=-35;offset<=0;offset++){
  int before=list.text_offset;unsigned unchanged=redraws;
  tick(24);assert(list.text_offset==before && redraws==unchanged);
  tick(1);assert(list.text_offset==offset && redraws==unchanged+1);
 }
 assert(list.text_offset==0 && list.text_anim.act_time==list.text_anim.time);
 held=redraws;tick(175);assert(list.text_offset==0 && redraws==held);
 tick(1);assert(list.text_offset==-1); /* Same 3520-ms pause at the left end. */
 /* Another animation still runs at the original 20-ms cadence during pauses. */
 mui_list_view_start_text_anim(&list);
 list.anim.path_cb=lv_anim_path_linear;mui_anim_set_values(&list.anim,0,100);
 mui_anim_set_time(&list.anim,2000);mui_anim_start(&list.anim);tick(50);
 assert(list.text_offset==0 && list.anim.current_value==50);mui_anim_stop(&list.anim);
 /* Input selection restarts from the beginning; short labels stop scrolling. */
 tick(125);assert(list.text_offset==-1);
 mui_input_event_t event={INPUT_KEY_RIGHT,INPUT_TYPE_SHORT};mui_list_view_on_input(&view,&event);
 assert(list.focus_index==1 && list.text_offset==0 && list.text_anim.act_time==0);
 assert(list.text_anim.end_value==-92);tick(150);assert(list.text_offset==0);
 mui_list_view_on_input(&view,&event);assert(list.focus_index==2 && list.text_offset==0 && !active(&list.text_anim));
 mui_anim_stop(&list.anim);
 /* Resize only restarts when width changes, before drawing the new layout. */
 list.focus_index=0;mui_list_view_start_text_anim(&list);tick(175);assert(list.text_offset==-1);
 mui_canvas_t canvas={255,64};mui_list_view_update_canvas(&list,&canvas);
 assert(list.text_offset==0 && !active(&list.text_anim));
 canvas.width=64;mui_list_view_update_canvas(&list,&canvas);assert(active(&list.text_anim) && list.text_anim.end_value==-101);
 tick(175);assert(list.text_offset==-1);uint32_t elapsed=list.text_anim.act_time;
 canvas.height=51;mui_list_view_update_canvas(&list,&canvas);assert(list.text_anim.act_time==elapsed && list.text_offset==-1);
 canvas.width=13;mui_list_view_update_canvas(&list,&canvas);assert(!active(&list.text_anim) && list.text_offset==0);
 canvas.width=128;mui_list_view_update_canvas(&list,&canvas);
 /* Two maximal measured widths cannot wrap the int16_t output field. */
 list.items->data[0].text="65535";list.items->data[0].sub_text="65535";
 mui_list_view_start_text_anim(&list);assert(list.text_anim.end_value==-32767);
 assert(list.text_anim.time==3000u+32767u*500u);
 list.text_anim.act_time=list.text_anim.time;
 assert(list.text_anim.path_cb(&list.text_anim)==-32767);
 mui_list_view_text_anim_exec(&list,-32767);assert(list.text_offset==-32767);
 mui_anim_t zero=list.text_anim;zero.start_value=zero.end_value=0;zero.act_time=UINT32_MAX;
 assert(zero.path_cb(&zero)==0);
 enabled=false;mui_list_view_start_text_anim(&list);assert(!active(&list.text_anim) && list.text_offset==0);
 list.canvas_width=128;list.focus_index=0;list.items->data[0].text="128";list.items->data[0].sub_text="33";
 mui_list_view_start_text_anim(&list);assert(active(&list.text_anim) && list.text_anim.end_value==-53);
 list.items->data[0].text="75";mui_list_view_start_text_anim(&list);assert(!active(&list.text_anim));
 enabled=true;list.focus_index=99;mui_list_view_start_text_anim(&list);assert(!active(&list.text_anim));
 list.items->count=0;list.focus_index=0;mui_list_view_start_text_anim(&list);assert(!active(&list.text_anim));
 puts("PASS LCD 2px/s, first movement3500ms, both end holds3520ms, no redundant redraw, concurrent animation, focus/resize, bounds");
#else
 assert(list.text_anim.time==3700 && list.text_anim.path_cb==lv_anim_path_linear);
 tick(1);assert(list.text_offset==-1); /* Original OLED movement starts immediately. */
 uint32_t elapsed=list.text_anim.act_time;mui_canvas_t canvas={255,64};
 mui_list_view_update_canvas(&list,&canvas);assert(list.text_anim.act_time==elapsed && list.text_offset==-1);
 puts("PASS OLED original timing/path and canvas behavior unchanged");
#endif
 mui_list_view_on_exit(&view);assert(m_anim_ptr_array->count==0 && !m_anim_tmr_started);
 return 0;
}
'''

    def test_lcd_timing_and_lifecycle(self):
        self.compile_run(self.code(True))

    def test_oled_unchanged(self):
        self.compile_run(self.code(False))


if __name__ == '__main__':
    unittest.main()
