"""Fail each allocation of the real generic constructors and verify rollback."""
import unittest
from root_host import HostTests, SRC, function

class GenericAllocations(HostTests):
    def test_every_constructor_allocation_and_timer_failure(self):
        core = (SRC / 'mui/mui_view.c').read_text()
        parts = [function(core, 'mui_view_create'), function(core, 'mui_view_free')]
        names = ('mui_list_view', 'mui_msg_box', 'mui_text_input', 'mui_toast_view')
        for name in names:
            source = (SRC / 'mui/view' / (name + '.c')).read_text()
            parts += [function(source, name + '_create'), function(source, name + '_free')]
        callbacks = '\n'.join(
            f'static void {name}_on_{event}(void) {{}}'
            for name in names for event in ('draw', 'input', 'enter', 'exit'))
        self.compile_run(r'''
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
typedef struct {void *user_data; void (*draw_cb)(void),(*input_cb)(void),(*enter_cb)(void),(*exit_cb)(void);} mui_view_t;
typedef struct {bool initialized;} string_t[1];
static unsigned calls,fail_call,live,strings,timer_calls,timer_stop_calls;
static int timer_result;
static void *mui_mem_malloc(size_t n){calls++;if(calls==fail_call)return NULL;void*p=malloc(n);assert(p);memset(p,0xa5,n);live++;return p;}
static void mui_mem_free(void*p){if(p){assert(live);live--;free(p);}}
static void string_init(string_t s){s->initialized=true;strings++;}
static void string_clear(string_t s){assert(s->initialized&&strings);s->initialized=false;strings--;}
typedef struct {string_t text,sub_text;} mui_list_item_t;
typedef struct {unsigned size;} items_t[1];
typedef struct {unsigned index; void*items;} mui_list_item_array_it_t[1];
typedef struct {mui_view_t*p_view;items_t items;unsigned focus_index,scroll_offset,canvas_width,canvas_height,first_draw;
 void*selected_cb;void*cmp_cb;void*user_data;int anim_value,anim_type,text_offset,item_gap,anim,text_anim,gap_anim;} mui_list_view_t;
typedef struct {mui_view_t*p_view;string_t header,message,btn_center_text,btn_left_text,btn_right_text;void*event_cb;int focus;void*user_data;} mui_msg_box_t;
typedef struct {mui_view_t*p_view;unsigned focus_row,focus_column,max_length;bool clear_default_text;string_t header,input_text;void*event_cb;void*user_data;} mui_text_input_t;
typedef struct {mui_view_t*p_view;string_t message;bool is_visible;} mui_toast_view_t;
#define LIST_ANIM_FOCUS 0
#define LIST_ITEM_HEIGHT 13
static bool mui_list_view_anim_enabled(void){return false;}
static void mui_anim_init(int*a){*a=0;}
static void mui_anim_stop(int*a){*a=0;}
static void mui_anim_set_var(int*a,void*v){}
static void mui_anim_set_path_cb(int*a,void(*cb)(void)){}
static void mui_anim_set_exec_cb(int*a,void(*cb)(void)){}
static void mui_anim_set_values(int*a,int b,int c){}
static void mui_anim_set_time(int*a,int n){}
static void lv_anim_path_ease_in_out(void){}
static void lv_anim_path_linear(void){}
static void mui_list_view_anim_exec(void){}
static void mui_list_view_text_anim_exec(void){}
static void mui_list_view_gap_anim_exec(void){}
static void mui_list_item_array_init(items_t a){a->size=0;}
static void mui_list_item_array_it(mui_list_item_array_it_t it,items_t a){it->index=0;it->items=a;}
static bool mui_list_item_array_end_p(mui_list_item_array_it_t it){return true;}
static mui_list_item_t *mui_list_item_array_ref(mui_list_item_array_it_t it){assert(false);return NULL;}
static void mui_list_item_array_next(mui_list_item_array_it_t it){it->index++;}
static void mui_list_item_array_clear(items_t a){a->size=0;}
typedef int ret_code_t;
#define NRF_SUCCESS 0
#define APP_TIMER_MODE_SINGLE_SHOT 0
static int m_toast_timer_id;
static bool m_toast_timer_initialized;
static void mui_toast_timer_handler(void*context){}
static int app_timer_create(int*t,int mode,void(*cb)(void*)){timer_calls++;return timer_result;}
static int app_timer_stop(int t){timer_stop_calls++;return 0;}
''' + callbacks + '\n' + '\n'.join(parts) + r'''
static void begin(unsigned fail){assert(!live&&!strings);calls=0;fail_call=fail;timer_calls=0;timer_result=0;}
#define CHECK_VIEW(name) do { \
 for(unsigned i=1;i<=2;i++){begin(i);assert(name##_create()==NULL);assert(live==0&&strings==0&&calls==i);} \
 begin(0);name##_t *v=name##_create();assert(v&&v->p_view&&v->p_view->user_data==v&&live==2); \
 name##_free(v);assert(!live&&!strings);name##_free(NULL);assert(!live&&!strings); \
}while(0)
int main(void){
 CHECK_VIEW(mui_list_view);CHECK_VIEW(mui_msg_box);CHECK_VIEW(mui_text_input);CHECK_VIEW(mui_toast_view);
 begin(0);m_toast_timer_initialized=false;timer_result=1;
 assert(mui_toast_view_create()==NULL);assert(!live&&!strings&&!m_toast_timer_initialized&&timer_calls==1);
 begin(0);mui_toast_view_t*t=mui_toast_view_create();assert(t&&m_toast_timer_initialized&&!t->is_visible);
 mui_toast_view_free(t);assert(!live&&!strings);
 begin(0);mui_view_t*v=mui_view_create();assert(v&&!v->user_data&&!v->draw_cb&&!v->input_cb&&!v->enter_cb&&!v->exit_cb);
 mui_view_free(v);assert(!live);begin(1);assert(!mui_view_create());
 puts("PASS: all generic allocation positions, timer failure rollback, initialized callbacks and NULL cleanup");
}
''')

    def test_uninitialized_viewport_is_inert(self):
        source = (SRC / 'mui/mui_view_port.c').read_text()
        code = '\n'.join(function(source, n) for n in (
            'mui_view_port_create','mui_view_port_free','mui_view_port_input',
            'mui_view_port_draw','mui_view_port_enable_set','mui_view_port_update'))
        self.compile_run(r'''
#include <assert.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
typedef int mui_input_event_t;
typedef int mui_canvas_t;
typedef struct vp mui_view_port_t;
struct vp {bool enabled;void*user_data;void(*draw_cb)(mui_view_port_t*,mui_canvas_t*);void(*input_cb)(mui_view_port_t*,mui_input_event_t*);};
static bool fail;static unsigned updates,callbacks;
static void*mui_mem_malloc(size_t n){if(fail)return NULL;void*p=malloc(n);assert(p);memset(p,0xa5,n);return p;}
static void mui_mem_free(void*p){free(p);}
static void*mui(void){return NULL;}
static void mui_update(void*p){updates++;}
static void callback(mui_view_port_t*v,int*c){callbacks++;}
''' + code + r'''
int main(void){
 fail=true;assert(!mui_view_port_create());fail=false;
 mui_view_port_t*v=mui_view_port_create();assert(v&&!v->enabled&&!v->user_data&&!v->draw_cb&&!v->input_cb);
 mui_view_port_input(v,NULL);mui_view_port_draw(v,NULL);mui_view_port_update(v);assert(!updates);
 v->draw_cb=callback;v->input_cb=callback;mui_view_port_input(v,NULL);mui_view_port_draw(v,NULL);assert(callbacks==2);
 mui_view_port_enable_set(v,true);mui_view_port_update(v);assert(updates==1);mui_view_port_free(v);
 mui_view_port_input(NULL,NULL);mui_view_port_draw(NULL,NULL);mui_view_port_update(NULL);mui_view_port_enable_set(NULL,true);mui_view_port_free(NULL);
 puts("PASS: viewport cannot dispatch stale callbacks and handles allocation failure");
}
''')

if __name__ == '__main__': unittest.main()
