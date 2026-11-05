"""Real list lifecycle and input handlers with tracked allocations/animations."""
import unittest
from root_host import HostTests, SRC, function

class ListTests(HostTests):
    def test_empty_navigation_bounds_and_complete_disposal(self):
        source = (SRC / 'mui/view/mui_list_view.c').read_text()
        code = '\n'.join(function(source, n) for n in ('mui_list_view_value_x', 'mui_list_view_start_text_anim',
            'mui_list_view_on_input', 'mui_list_view_on_exit', 'mui_list_view_free', 'mui_list_view_set_item'))
        self.compile_run(r'''
#include <assert.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define LIST_ITEM_HEIGHT 13
#define LIST_ANIM_SHORT_TIME 150
#define LIST_ANIM_LONG_TIME 300
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
#define mui_nav_diag_list(type,selection,focus) ((void)(type),(void)(selection),(void)(focus))
typedef char *string_t[1];
typedef struct {uint32_t icon;string_t text,sub_text;void *user_data;} mui_list_item_t;
typedef struct {size_t count;mui_list_item_t data[4];} items_t;
typedef struct {items_t *items;size_t index;} iter_t;
typedef iter_t mui_list_item_array_it_t[1];
typedef struct {void *user_data;} mui_view_t;
typedef struct {int type,key;} mui_input_event_t;
typedef struct list_s mui_list_view_t;
struct list_s {mui_view_t *p_view;items_t items[1];uint16_t focus_index,scroll_offset;
 uint8_t canvas_height,canvas_width,anim_type,item_gap;int16_t anim_value,text_offset;
 int anim,text_anim,gap_anim;
 void (*selected_cb)(int,mui_list_view_t*,mui_list_item_t*);};
static unsigned strings,freed_strings,freed_blocks,selected;
static bool enabled=true;
static bool mui_list_view_anim_enabled(void){return enabled;}
static size_t mui_list_item_array_size(items_t *a){return a->count;}
static mui_list_item_t *mui_list_item_array_get(items_t *a,size_t i){assert(i<a->count);return &a->data[i];}
static void mui_list_item_array_it(iter_t *it,items_t *a){it->items=a;it->index=0;}
static bool mui_list_item_array_end_p(iter_t *it){return it->index>=it->items->count;}
static mui_list_item_t *mui_list_item_array_ref(iter_t *it){return mui_list_item_array_get(it->items,it->index);}
static void mui_list_item_array_next(iter_t *it){it->index++;}
static void mui_list_item_array_clear(items_t *a){a->count=0;}
static void string_clear(string_t s){if(s[0]){free(s[0]);freed_strings++;s[0]=NULL;}}
static const char *string_get_cstr(string_t s){return s[0]?s[0]:"";}
static void string_set_str(string_t s,const char *v){string_clear(s);s[0]=malloc(strlen(v)+1);assert(s[0]);strcpy(s[0],v);strings++;}
static unsigned mui_list_view_get_utf8_width(const char *s){return (unsigned)strlen(s)*6;}
static void mui_mem_free(void *p){if(p){freed_blocks++;free(p);}}
static void mui_anim_stop(int *a){*a=0;}
static void mui_anim_start(int *a){*a=1;}
static void mui_anim_set_time(int *a,int b){}
static void mui_anim_set_values(int *a,int b,int c){}
static void mui_anim_set_auto_restart(int *a,bool b){}
static void callback(int event,mui_list_view_t *v,mui_list_item_t *i){selected++;}
''' + code + r'''
int main(void){
 mui_list_view_t *list=calloc(1,sizeof(*list));assert(list);
 list->p_view=calloc(1,sizeof(mui_view_t));assert(list->p_view);list->p_view->user_data=list;
 list->canvas_height=64;list->canvas_width=128;list->selected_cb=callback;
 mui_input_event_t event;
 for(int kind=0;kind<3;kind++)for(int key=0;key<3;key++){
  event.type=kind;event.key=key;mui_list_view_on_input(list->p_view,&event);
  assert(list->focus_index==0 && list->scroll_offset==0 && selected==0);
 }
 list->text_anim=1;mui_list_view_start_text_anim(list);assert(!list->text_anim);
 mui_list_view_set_item(list,0,1,"invalid",NULL);assert(strings==0);
 list->items->count=4;
 for(unsigned i=0;i<4;i++){
  string_set_str(list->items->data[i].text,"A sufficiently long allocated title");
  string_set_str(list->items->data[i].sub_text,"A sufficiently long allocated subtitle");
 }
 mui_list_view_set_item(list,99,1,"invalid",NULL);assert(strings==8);
 list->focus_index=99;mui_list_view_start_text_anim(list);assert(!list->text_anim);
 list->focus_index=0;mui_list_view_start_text_anim(list);assert(list->text_anim);
 enabled=false;mui_list_view_start_text_anim(list);assert(!list->text_anim);enabled=true;
 for(unsigned i=0;i<200;i++){
  event.type=INPUT_TYPE_SHORT;event.key=(int)(i%3);mui_list_view_on_input(list->p_view,&event);
  assert(list->focus_index<list->items->count);
 }
 list->anim=list->text_anim=list->gap_anim=1;list->anim_value=17;list->text_offset=-19;
 mui_list_view_on_exit(list->p_view);
 assert(!list->anim && !list->text_anim && !list->gap_anim && list->anim_value==0 && list->text_offset==0);
 assert(list->item_gap==LIST_ITEM_HEIGHT);
 mui_list_view_free(list);assert(freed_blocks==2 && freed_strings==strings);
 mui_list_view_free(NULL);assert(freed_blocks==2);
 puts("PASS: empty navigation, out-of-range updates, animation shutdown and every subtitle freed");
}
''')

if __name__ == '__main__':
    unittest.main()
